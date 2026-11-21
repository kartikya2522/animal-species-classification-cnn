"""WildLens API: FastAPI app factory.

Run from backend/:  uvicorn app.main:app --reload
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.config import Settings, get_settings
from app.routers import chat, health, metrics, models, predict, species
from app.services.chat.retrieval import Retriever
from app.services.chat.service import ChatService
from app.services.inference import ModelManager
from app.services.knowledge import SpeciesKB
from app.services.metrics import load_metrics
from app.services.ratelimit import RateLimiter
from app.services.registry import load_registry

log = logging.getLogger("wildlens")

DESCRIPTION = """
WildLens backend: identify an animal (80 classes) from a photo with an ONNX
EfficientNetV2-S, explain the prediction with a class activation map, and serve the
project's training/evaluation metrics and figures, a species knowledge base
(80 classes), and a grounded "Field Guide" chat about any animal (SSE).

* Inference runs on CPU with ONNX Runtime; the model is loaded once at startup.
* Uploads: JPEG, PNG or WebP, validated by decoding; EXIF orientation applied.
* Errors use `{"detail": "..."}` (validation errors use FastAPI's list form).
"""

UPLOAD_PATHS = ("/api/predict", "/api/explain")
MULTIPART_OVERHEAD = 64 * 1024


class StreamedUploadLimit:
    """Enforces the upload size limit while reading a request body that has no Content-Length
    (chunked transfer). The body is buffered up to ``limit`` bytes and replayed to the app;
    beyond that the request is answered with 413 without reading the rest. Requests that do
    declare a Content-Length are passed through (checked by the ``reject_oversized_uploads``
    middleware and again in the handler)."""

    def __init__(self, app, paths, limit: int, detail: str):
        self.app, self.paths, self.limit, self.detail = app, set(paths), limit, detail

    async def __call__(self, scope, receive, send):
        if (scope["type"] != "http" or scope.get("method") != "POST" or scope.get("path") not in self.paths
                or any(k.lower() == b"content-length" for k, _ in scope.get("headers") or [])):
            await self.app(scope, receive, send)
            return
        chunks, total, more = [], 0, True
        while more:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                return
            body = msg.get("body", b"")
            total += len(body)
            if total > self.limit:
                await JSONResponse(status_code=413, content={"detail": self.detail})(scope, receive, send)
                return
            chunks.append(body)
            more = msg.get("more_body", False)
        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
CHAT_PATH = "/api/chat"
# Generic User-Agent for all outbound requests (Wikipedia, Wikidata, iNaturalist, Groq, ...):
# no personal names, e-mails or usernames.
USER_AGENT = f"WildLens/{__version__} (educational student project)"


def create_app(
    settings: Optional[Settings] = None, transport: Optional[httpx.AsyncBaseTransport] = None
) -> FastAPI:
    """``transport`` replaces the outbound HTTP transport (tests pass an ``httpx.MockTransport``)."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        registry = load_registry(settings)
        app.state.settings = settings
        app.state.manager = ModelManager(registry, settings.effective_intra_op_threads)
        figure_dir = settings.resolve(settings.figures_dir)
        figure_names = metrics.list_figure_names(figure_dir)
        app.state.metrics = load_metrics(settings.resolve(settings.results_dir), figure_names)

        app.state.kb = SpeciesKB.load(settings.resolve(settings.species_kb_path))
        http = httpx.AsyncClient(
            transport=transport,
            headers={"User-Agent": USER_AGENT},
            timeout=httpx.Timeout(settings.retrieval_timeout_s, connect=5.0),
            follow_redirects=True,
        )
        app.state.http = http
        served = app.state.metrics.get(registry.default) or {}
        acc = (served.get("summary") or {}).get("test_accuracy")
        retriever = Retriever(app.state.kb, http, settings.retrieval_timeout_s, settings.chat_live_lookup, acc)
        app.state.chat = ChatService(settings, retriever, http)
        app.state.chat_limiter = RateLimiter(settings.chat_rate_limit_per_minute, 60.0)
        log.info(
            "WildLens API %s ready: models loaded=%s, species=%d, chat providers=%s",
            __version__, list(app.state.manager.loaded), len(app.state.kb),
            [p.name for p in app.state.chat.llm_providers()] + ["fallback"],
        )
        try:
            yield
        finally:
            await http.aclose()

    app = FastAPI(
        title="WildLens API",
        version=__version__,
        description=DESCRIPTION,
        lifespan=lifespan,
        openapi_tags=[
            {"name": "inference", "description": "Classify photos and explain predictions."},
            {"name": "models", "description": "Model registry."},
            {"name": "research", "description": "Metrics and figures from the training runs."},
            {"name": "species", "description": "Species knowledge base (80 classes)."},
            {"name": "chat", "description": "Grounded Field Guide chat (Server-Sent Events)."},
            {"name": "health", "description": "Liveness/readiness."},
        ],
    )
    app.add_middleware(
        StreamedUploadLimit,
        paths=UPLOAD_PATHS,
        limit=settings.max_upload_bytes + MULTIPART_OVERHEAD,
        detail=f"File too large; the limit is {settings.max_upload_mb:g} MB.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def reject_oversized_uploads(request: Request, call_next):
        # Fail fast on a declared oversized body, before multipart parsing spools it.
        # The exact per-file check happens again in the handler. Bodies without a Content-Length
        # (chunked) are size-checked while streaming by StreamedUploadLimit.
        if request.method == "POST" and request.url.path in UPLOAD_PATHS:
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > settings.max_upload_bytes + MULTIPART_OVERHEAD:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"File too large; the limit is {settings.max_upload_mb:g} MB."},
                )
        if request.method == "POST" and request.url.path == CHAT_PATH:
            length = request.headers.get("content-length")
            if not (length and length.isdigit()):
                return JSONResponse(status_code=411, content={"detail": "Content-Length is required."})
            if int(length) > settings.chat_max_body_kb * 1024:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Chat request too large; the limit is {settings.chat_max_body_kb} KB."},
                )
        return await call_next(request)

    for r in (predict.router, models.router, metrics.router, species.router, chat.router, health.router):
        app.include_router(r, prefix="/api")
    return app


app = create_app()
