"""POST /api/chat: grounded Field Guide chat, streamed as Server-Sent Events."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import Settings
from app.deps import get_chat, get_settings
from app.schemas import ChatRequest, ErrorResponse
from app.services.chat.service import ChatService

router = APIRouter(tags=["chat"])

SSE_DESCRIPTION = """
Streams `text/event-stream`. Events (each `data:` is one JSON object):

* `meta` (first): `provider` (`groq` | `ollama` | `fallback`), `model`, `retrieval` (`kb` | `live` | `kb+live` | `none` | `unavailable`), `subjects`, `sources` [{id, title, url, kind}], `skipped` providers with reasons.
* `token`: `{"text": "..."}` answer deltas (Markdown; citations as `[n]` matching `sources[].id`).
* `done`: `{"provider", "finish_reason", "elapsed_ms"}`, or
* `error`: `{"message"}` if generation fails after it started.

Provider chain: Groq (if `GROQ_API_KEY` is set) -> Ollama (if `WILDLENS_OLLAMA_URL` is set) -> a retrieval-only
answer composed from the sources. Rate limited per client IP (429 with `Retry-After`).
"""


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request) -> None:
    limiter = request.app.state.chat_limiter
    wait = limiter.hit(_client_ip(request))
    if wait > 0:
        raise HTTPException(
            status_code=429,
            detail="Too many chat requests; please wait a moment.",
            headers={"Retry-After": str(int(wait) + 1)},
        )


@router.post(
    "/chat",
    summary="Ask the Field Guide about any animal (SSE stream)",
    description=SSE_DESCRIPTION,
    response_class=StreamingResponse,
    responses={
        200: {"content": {"text/event-stream": {}}, "description": "SSE stream of meta/token/done|error events."},
        413: {"model": ErrorResponse, "description": "Request body too large."},
        422: {"description": "Invalid messages (count, user-message length, roles, last message not from the user)."},
        429: {"model": ErrorResponse, "description": "Per-IP rate limit exceeded."},
    },
)
async def chat(
    body: ChatRequest,
    request: Request,
    _: None = Depends(rate_limit),
    settings: Settings = Depends(get_settings),
    service: ChatService = Depends(get_chat),
):
    if len(body.messages) > settings.chat_max_messages:
        return _invalid(f"At most {settings.chat_max_messages} messages are allowed.")
    for m in body.messages:
        # Only questions are limited; earlier answers are trimmed server-side (see ChatService).
        if m.role == "user" and len(m.content) > settings.chat_max_message_chars:
            return _invalid(f"Each question must be at most {settings.chat_max_message_chars} characters.")
    if body.messages[-1].role != "user":
        return _invalid("The last message must have role 'user'.")
    if not body.messages[-1].content.strip():
        return _invalid("The last message is empty.")

    messages = [{"role": m.role, "content": m.content.strip()} for m in body.messages]
    context: Dict[str, Any] = body.context.model_dump() if body.context else {}
    return StreamingResponse(
        service.stream(messages, context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _invalid(msg: str) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": msg})
