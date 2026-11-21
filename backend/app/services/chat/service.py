"""Chat orchestration: retrieve -> provider chain -> Server-Sent Events.

Event stream (``text/event-stream``), every ``data:`` line is one JSON object:

* ``meta``  — once, first: provider/model actually answering, sources [{id,title,url,kind}],
  subjects, retrieval mode, providers that were skipped and why.
* ``token`` — ``{"text": "..."}`` deltas, in order.
* ``done``  — ``{"provider", "finish_reason", "elapsed_ms"}``; terminal.
* ``error`` — ``{"message"}``; terminal (only if a provider fails mid-answer or the total
  time budget runs out after streaming started).

Retrieved text and model output only ever appear JSON-encoded inside ``data:``, so they
cannot inject SSE fields or events.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from app.config import Settings
from app.services.chat.prompt import build_messages
from app.services.chat.providers import (
    FallbackProvider,
    GroqProvider,
    OllamaProvider,
    Provider,
    ProviderError,
)
from app.services.chat.retrieval import Grounding, Retriever

log = logging.getLogger("wildlens.chat")


def sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


class ChatService:
    def __init__(self, settings: Settings, retriever: Retriever, http: httpx.AsyncClient):
        self.settings = settings
        self.retriever = retriever
        self.http = http

    def llm_providers(self) -> List[Provider]:
        s = self.settings
        timeout = httpx.Timeout(s.llm_read_timeout_s, connect=s.llm_connect_timeout_s)
        out: List[Provider] = []
        if s.groq_api_key is not None and s.groq_api_key.get_secret_value().strip():
            out.append(GroqProvider(self.http, s.groq_api_key.get_secret_value().strip(), s.groq_model,
                                    s.groq_base_url, s.chat_max_tokens, timeout, s.groq_retry_delay_s))
        if s.ollama_url:
            out.append(OllamaProvider(self.http, s.ollama_url, s.ollama_model, s.chat_max_tokens, timeout))
        return out

    def provider_status(self) -> Dict[str, Any]:
        s = self.settings
        return {
            "groq": {"configured": bool(s.groq_api_key and s.groq_api_key.get_secret_value().strip()),
                     "model": s.groq_model},
            "ollama": {"configured": bool(s.ollama_url), "model": s.ollama_model},
            "fallback": {"configured": True},
        }

    async def stream(self, messages: List[Dict[str, str]], context: Optional[Dict[str, Any]]) -> AsyncIterator[str]:
        t0 = time.monotonic()
        deadline = t0 + self.settings.chat_timeout_s

        def remaining() -> float:
            return max(0.0, deadline - time.monotonic())

        try:
            grounding = await asyncio.wait_for(self.retriever.retrieve(messages, context),
                                               timeout=min(self.settings.retrieval_timeout_s + 2, remaining()))
        except Exception as exc:  # never fail the chat on retrieval
            log.warning("retrieval failed: %s", type(exc).__name__)
            grounding = Grounding(retrieval="unavailable")

        llm_messages = build_messages(
            trim_history(messages, self.settings.chat_history_messages, self.settings.chat_max_assistant_chars),
            grounding,
        )
        skipped: List[Dict[str, str]] = []
        providers = self.llm_providers()
        if not providers:
            skipped.append({"provider": "llm", "reason": "no LLM configured (set GROQ_API_KEY)"})

        for p in providers:
            gen = p.stream(llm_messages).__aiter__()
            try:
                first = await asyncio.wait_for(gen.__anext__(), timeout=remaining())
            except StopAsyncIteration:
                skipped.append({"provider": p.name, "reason": "empty response"})
                continue
            except asyncio.TimeoutError:
                skipped.append({"provider": p.name, "reason": "timeout"})
                await _aclose(gen)
                continue
            except ProviderError as exc:
                skipped.append({"provider": p.name, "reason": str(exc)})
                continue
            except Exception as exc:  # unexpected provider bug: fall through, don't 500
                log.exception("provider %s failed", p.name)
                skipped.append({"provider": p.name, "reason": type(exc).__name__})
                continue
            log.info("chat answered by %s (skipped=%s)", p.name, skipped)
            yield sse("meta", self._meta(p, grounding, skipped))
            yield sse("token", {"text": first})
            try:
                while True:
                    try:
                        delta = await asyncio.wait_for(gen.__anext__(), timeout=remaining())
                    except StopAsyncIteration:
                        break
                    yield sse("token", {"text": delta})
            except asyncio.TimeoutError:
                await _aclose(gen)
                yield sse("error", {"message": "The answer took too long and was cut off. Please try again."})
                return
            except Exception as exc:
                log.warning("provider %s failed mid-stream: %s", p.name, type(exc).__name__)
                await _aclose(gen)
                yield sse("error", {"message": "The language model stopped unexpectedly. Please try again."})
                return
            yield sse("done", {"provider": p.name, "finish_reason": "stop", "elapsed_ms": _ms(t0)})
            return

        reason = "no language model is configured" if not providers else "the language model is unavailable right now"
        fb = FallbackProvider(grounding, reason)
        yield sse("meta", self._meta(fb, grounding, skipped))
        async for delta in fb.stream(llm_messages):
            yield sse("token", {"text": delta})
        yield sse("done", {"provider": fb.name, "finish_reason": "stop", "elapsed_ms": _ms(t0)})

    @staticmethod
    def _meta(p: Provider, g: Grounding, skipped: List[Dict[str, str]]) -> Dict[str, Any]:
        return {
            "provider": p.name,
            "model": p.model,
            "retrieval": g.retrieval,
            "subjects": [s.public() for s in g.subjects],
            "sources": [s.public() for s in g.sources],
            "skipped": skipped,
        }


_INLINE_SOURCES_RE = re.compile(r"\n*\*\*Sources\*\*\n[\s\S]*?(?=\n\n_Retrieval-only answer|\Z)")


def clip_answer(text: str, max_chars: int) -> str:
    """An earlier assistant answer as LLM history: drop the inline "**Sources**" list of
    retrieval-only answers (the sources are re-sent each turn), then keep at most ``max_chars``
    characters from the start, cut at a word boundary."""
    text = _INLINE_SOURCES_RE.sub("", text).strip()
    if len(text) <= max_chars:
        return text
    cut = text[: max_chars - 2]
    if " " in cut[-80:]:
        cut = cut[: cut.rindex(" ")]
    return cut.rstrip() + " …"


def trim_history(messages: List[Dict[str, str]], max_messages: int, max_assistant_chars: int) -> List[Dict[str, str]]:
    """Last ``max_messages`` turns (starting with a user turn), assistant turns clipped."""
    recent = messages[-max_messages:]
    while len(recent) > 1 and recent[0]["role"] != "user":
        recent = recent[1:]
    return [
        {"role": m["role"], "content": clip_answer(m["content"], max_assistant_chars)}
        if m["role"] == "assistant" else m
        for m in recent
    ]


async def _aclose(gen: Any) -> None:
    try:
        await gen.aclose()
    except Exception:
        pass


def _ms(t0: float) -> float:
    return round((time.monotonic() - t0) * 1000.0, 1)
