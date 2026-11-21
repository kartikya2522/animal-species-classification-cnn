"""Tiny in-memory per-key sliding-window rate limiter (single process; no extra dependency).

For a multi-worker or serverless deployment use a shared store instead; Phase 7 deploys
chat as a Vercel function with its own limiter.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, Optional


class RateLimiter:
    def __init__(self, limit: int, window_s: float = 60.0, max_keys: int = 10_000):
        self.limit, self.window, self.max_keys = limit, window_s, max_keys
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, now: Optional[float] = None) -> float:
        """Record a request. Returns 0 if allowed, else seconds until the next slot frees up."""
        if self.limit <= 0:
            return 0.0
        now = time.monotonic() if now is None else now
        with self._lock:
            q = self._hits.get(key)
            if q is None:
                if len(self._hits) >= self.max_keys:
                    self._evict(now)
                q = self._hits[key] = deque()
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.limit:
                return max(0.001, self.window - (now - q[0]))
            q.append(now)
            return 0.0

    def _evict(self, now: float) -> None:
        stale = [k for k, q in self._hits.items() if not q or now - q[-1] >= self.window]
        for k in stale:
            del self._hits[k]
        if len(self._hits) >= self.max_keys:  # still full: drop the oldest key
            self._hits.pop(next(iter(self._hits)))
