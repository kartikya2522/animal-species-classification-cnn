"""LLM providers for the chat chain: Groq -> Ollama (optional) -> retrieval-only fallback.

Each provider is an async generator of text deltas. A provider that fails *before*
yielding its first delta raises ``ProviderError`` and the chain moves on; the caller
treats a failure after the first delta as a stream error.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import AsyncIterator, Dict, List, Optional

import httpx

from app.services.chat.retrieval import Grounding, Subject, first_sentences

log = logging.getLogger("wildlens.chat")

RETRY_STATUSES = {429, 500, 502, 503, 504}


class ProviderError(Exception):
    """Provider unavailable (missing config, HTTP error, rate limit, timeout)."""


class Provider:
    name = "base"
    model: Optional[str] = None

    def stream(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:  # pragma: no cover - interface
        raise NotImplementedError


class GroqProvider(Provider):
    """Groq's OpenAI-compatible chat completions API, called directly with httpx."""

    name = "groq"

    def __init__(self, http: httpx.AsyncClient, api_key: str, model: str, base_url: str,
                 max_tokens: int, timeout: httpx.Timeout, retry_delay_s: float = 1.0):
        self.http, self._key, self.model, self.base_url = http, api_key, model, base_url.rstrip("/")
        self.max_tokens, self.timeout, self.retry_delay_s = max_tokens, timeout, retry_delay_s

    async def stream(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        body = {"model": self.model, "messages": messages, "stream": True,
                "temperature": 0.3, "max_tokens": self.max_tokens}
        headers = {"Authorization": f"Bearer {self._key}"}
        started = False
        for attempt in range(2):  # one retry on 429/5xx/transport errors, only before any output
            try:
                async with self.http.stream("POST", f"{self.base_url}/chat/completions", json=body,
                                            headers=headers, timeout=self.timeout) as r:
                    if r.status_code != 200:
                        await r.aread()
                        if r.status_code in RETRY_STATUSES and attempt == 0:
                            await asyncio.sleep(_retry_after(r, self.retry_delay_s))
                            continue
                        raise ProviderError(f"groq HTTP {r.status_code}")
                    async for line in r.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data)
                        except ValueError:
                            continue
                        if chunk.get("error"):
                            raise ProviderError("groq stream error")
                        for ch in chunk.get("choices") or []:
                            delta = (ch.get("delta") or {}).get("content")
                            if delta:
                                started = True
                                yield delta
                    return
            except httpx.TransportError as exc:  # includes timeouts
                if started:
                    raise ProviderError(f"groq {type(exc).__name__} mid-stream") from None
                if attempt == 0:
                    await asyncio.sleep(self.retry_delay_s)
                    continue
                raise ProviderError(f"groq {type(exc).__name__}") from None


class OllamaProvider(Provider):
    name = "ollama"

    def __init__(self, http: httpx.AsyncClient, base_url: str, model: str, max_tokens: int, timeout: httpx.Timeout):
        self.http, self.base_url, self.model = http, base_url.rstrip("/"), model
        self.max_tokens, self.timeout = max_tokens, timeout

    async def stream(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        body = {"model": self.model, "messages": messages, "stream": True,
                "options": {"temperature": 0.3, "num_predict": self.max_tokens}}
        try:
            async with self.http.stream("POST", f"{self.base_url}/api/chat", json=body, timeout=self.timeout) as r:
                if r.status_code != 200:
                    await r.aread()
                    raise ProviderError(f"ollama HTTP {r.status_code}")
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except ValueError:
                        continue
                    if chunk.get("error"):
                        raise ProviderError("ollama stream error")
                    delta = (chunk.get("message") or {}).get("content")
                    if delta:
                        yield delta
                    if chunk.get("done"):
                        return
        except httpx.TransportError as exc:
            raise ProviderError(f"ollama {type(exc).__name__}") from None


# ---------------------------------------------------------------- no-LLM fallback
HABITAT_RE = re.compile(r"\b(native to|found in|lives? in|inhabit\w*|habitat|endemic|distributed|range[s]? )", re.I)


def _habitat_sentence(summary: str, skip: int) -> Optional[str]:
    sentences = re.split(r"(?<=[.!?])\s+", summary.strip())
    for s in sentences[skip:]:
        if HABITAT_RE.search(s):
            return s
    return None


def clean_extract(text: str) -> str:
    """Tidy Wikipedia plain-text leftovers such as "( ; from Nahuatl ...)" or "()"."""
    text = re.sub(r"\(\s*[;,]\s*", "(", text)
    text = re.sub(r"\s*\(\s*\)", "", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def _cite(ids: List[int]) -> str:
    return "".join(f"[{i}]" for i in ids)


def _subject_section(s: Subject, heading: bool) -> str:
    lines: List[str] = []
    title = f"**{s.name}**" + (f" (*{s.scientific_name}*)" if s.scientific_name and s.scientific_name != s.name else "")
    lines.append(f"### {s.name}" if heading else title)
    wiki = s.cite.get("summary", [])
    status_ids = s.cite.get("status", [])
    obs_ids = s.cite.get("observations", [])
    if s.summary:
        lines.append("")
        lines.append(clean_extract(first_sentences(s.summary, 3)) + " " + _cite(wiki))
    bullets = []
    if heading and s.scientific_name:
        bullets.append(f"- Scientific name: *{s.scientific_name}*")
    if s.is_group and s.group_note:
        note = s.group_note.split("—", 1)[-1].strip()
        bullets.append(f"- This WildLens class is a group, not a single species: {note}.")
    if s.status_code:
        bullets.append(f"- Conservation status: {s.status_label} ({s.status_code}), {s.status_source} {_cite(status_ids)}")
    elif s.status_label:
        bullets.append(f"- Conservation status: {s.status_label} {_cite(status_ids)}")
    if s.summary:
        hab = _habitat_sentence(s.summary, 3)
        if hab:
            bullets.append(f"- Where it lives: {clean_extract(hab)} {_cite(wiki)}")
    tax = [f"{k} {v}" for k, v in (s.taxonomy or {}).items() if v and k in ("class", "order", "family")]
    if tax:
        bullets.append(f"- Taxonomy: {', '.join(tax)}")
    if s.observations:
        bullets.append(f"- iNaturalist observations: {s.observations:,} {_cite(obs_ids)}")
    if s.model_accuracy is not None:
        bullets.append(f"- WildLens model accuracy on this class (test set): {s.model_accuracy * 100:.1f}% {_cite(s.cite.get('model', []))}")
    if bullets:
        lines.append("")
        lines.extend(bullets)
    return "\n".join(lines)


# Retrieval-only answers quote Wikipedia extracts verbatim, so they carry the licence notice.
WIKIPEDIA_ATTRIBUTION = ("_Text quoted from Wikipedia is available under "
                         "[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)._")


def compose_fallback(g: Grounding, reason: str = "no language model is configured") -> str:
    parts: List[str] = []
    if g.subjects:
        many = len(g.subjects) > 1
        parts.extend(_subject_section(s, heading=many) for s in g.subjects)
    project = [s for s in g.sources if s.kind == "project"]
    if project:
        parts.append(f"**About WildLens**\n\n{project[0].text} [{project[0].id}]")
    if not parts:
        if g.retrieval == "unavailable":
            parts.append("I couldn't reach my knowledge sources (Wikipedia, Wikidata, iNaturalist) just now, "
                         "so I can't answer that reliably. Information on the 80 WildLens species is still "
                         "available offline: try asking about one of them, e.g. \"Tell me about the red panda\".")
        else:
            parts.append("I couldn't find an animal in your question. The WildLens Field Guide answers questions "
                         "about animals, wildlife and conservation. Try naming an animal, e.g. "
                         "\"Where do axolotls live?\" or \"Is the snow leopard endangered?\"")
    if g.sources:
        refs = "\n".join(f"[{s.id}] {s.title}" + (f" — {s.url}" if s.url else "") for s in g.sources)
        parts.append("**Sources**\n\n" + refs)
    if g.sources:
        parts.append(f"_Retrieval-only answer: {reason}, so this was assembled directly from the sources above "
                     "and may not address every part of your question._")
    else:
        parts.append(f"_Retrieval-only answer: {reason}._")
    if any(s.kind == "wikipedia" for s in g.sources):
        parts.append(WIKIPEDIA_ATTRIBUTION)
    return "\n\n".join(parts)


class FallbackProvider(Provider):
    """Streams a deterministic answer composed from the retrieved facts."""

    name = "fallback"

    def __init__(self, grounding: Grounding, reason: str):
        self.grounding, self.reason = grounding, reason

    async def stream(self, messages: List[Dict[str, str]]) -> AsyncIterator[str]:
        text = compose_fallback(self.grounding, self.reason)
        pieces = re.findall(r"\S+\s*|\s+", text)
        for i in range(0, len(pieces), 4):  # a few words per token event, like an LLM stream
            yield "".join(pieces[i:i + 4])


def _retry_after(r: httpx.Response, default: float) -> float:
    """Honour a short Retry-After (capped at 3 s); longer waits fall through to the next provider."""
    if default <= 0:
        return 0.0
    try:
        return max(0.0, min(float(r.headers.get("retry-after", "")), 3.0))
    except ValueError:
        return default
