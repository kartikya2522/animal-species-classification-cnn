"""Runtime settings (env-driven, prefix ``WILDLENS_``).

Relative paths are resolved against the repository root, so the app behaves the
same whether uvicorn is started from ``backend/`` or from the repo root.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # backend/.env is optional and gitignored (see backend/.env.example).
    model_config = SettingsConfigDict(
        env_prefix="WILDLENS_",
        extra="ignore",
        env_file=str(REPO_ROOT / "backend" / ".env"),
        env_file_encoding="utf-8",
        populate_by_name=True,
    )

    repo_root: Path = REPO_ROOT
    registry_path: Path = Path("models/registry.json")
    results_dir: Path = Path("outputs/results")
    figures_dir: Path = Path("outputs/figures")

    # Comma-separated list, e.g. WILDLENS_CORS_ORIGINS="http://localhost:5173,https://x.app"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    max_upload_mb: float = Field(10.0, gt=0)
    # Decompression-bomb guard (decoded pixels, not bytes). 50 MP covers any phone photo.
    max_image_pixels: int = Field(50_000_000, gt=0)

    # top-1 softmax probability below this => low_confidence=true (see backend/README.md).
    low_confidence_threshold: float = Field(0.5, ge=0.0, le=1.0)

    # onnxruntime intra-op threads per session run; 0 = auto (min(4, cpu_count)).
    intra_op_threads: int = Field(0, ge=0)

    # /api/explain: overlay + heatmap are rendered at the uploaded image size,
    # downscaled so the longest side is at most this (keeps the JSON payload small).
    explain_max_side: int = Field(1024, ge=224, le=4096)
    overlay_alpha: float = Field(0.45, ge=0.0, le=1.0)

    # ------------------------------------------------------------ Phase 2: species KB + chat
    species_kb_path: Path = Path("data/species_kb.json")
    # Phase 4: local copies of the KB photos (scripts/cache_species_images.py), served at
    # /api/species-images/... so local mode shows photos offline. Missing dir = empty manifest.
    species_images_dir: Path = Path("data/species_images")

    # Groq (OpenAI-compatible, free tier, no card). Effective key: a non-empty WILDLENS_GROQ_API_KEY,
    # else a non-empty GROQ_API_KEY (each from the environment or backend/.env). Empty or
    # whitespace-only values count as unset, so the blank `WILDLENS_GROQ_API_KEY=` line shipped in
    # backend/.env.example never hides a GROQ_API_KEY.
    groq_api_key: Optional[SecretStr] = Field(
        None, validation_alias=AliasChoices("WILDLENS_GROQ_API_KEY", "groq_api_key")
    )
    groq_api_key_fallback: Optional[SecretStr] = Field(
        None, validation_alias=AliasChoices("GROQ_API_KEY", "groq_api_key_fallback"), repr=False
    )
    # Default chosen from the models your Groq key lists (https://console.groq.com/docs/models,
    # checked 2026-11-21): openai/gpt-oss-20b is the smaller, faster, higher-quota option;
    # WILDLENS_GROQ_MODEL=openai/gpt-oss-120b is the stronger one. Groq retires models, so
    # check the list if chat falls back to "retrieval-only" with an HTTP 404.
    groq_model: str = "openai/gpt-oss-20b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_retry_delay_s: float = Field(1.0, ge=0.0, le=10.0)  # wait before the single retry on 429/5xx

    # Ollama (local, optional): disabled unless WILDLENS_OLLAMA_URL is set, e.g. http://127.0.0.1:11434
    ollama_url: Optional[str] = None
    ollama_model: str = "llama3.2"

    chat_rate_limit_per_minute: int = Field(20, ge=0)  # per client IP; 0 disables
    chat_max_messages: int = Field(20, ge=1, le=100)
    chat_max_message_chars: int = Field(2000, ge=50, le=20000)  # user messages only
    # Earlier assistant answers are never rejected for length: they are trimmed to this many
    # characters (inline "Sources" block removed first) before being sent to the LLM.
    chat_max_assistant_chars: int = Field(1500, ge=100, le=20000)
    # Only the last N messages of the conversation go to the LLM (saves Groq free-tier tokens);
    # retrieval still sees every user turn for follow-up subjects.
    chat_history_messages: int = Field(10, ge=1, le=100)
    chat_max_body_kb: int = Field(64, ge=4)
    chat_max_tokens: int = Field(700, ge=64, le=4096)
    chat_timeout_s: float = Field(45.0, gt=0)  # total budget for one answer (retrieval + generation)
    retrieval_timeout_s: float = Field(10.0, gt=0)
    llm_connect_timeout_s: float = Field(5.0, gt=0)
    llm_read_timeout_s: float = Field(20.0, gt=0)
    chat_live_lookup: bool = True  # Wikipedia/Wikidata/iNaturalist lookups for animals outside the KB

    @field_validator("groq_api_key", "groq_api_key_fallback", mode="before")
    @classmethod
    def _blank_key_is_unset(cls, v):
        if v is None:
            return None
        raw = v.get_secret_value() if isinstance(v, SecretStr) else str(v)
        return raw.strip() or None

    @model_validator(mode="after")
    def _resolve_groq_key(self) -> "Settings":
        if self.groq_api_key is None and self.groq_api_key_fallback is not None:
            self.groq_api_key = self.groq_api_key_fallback
        return self

    def resolve(self, p: Path) -> Path:
        return p if p.is_absolute() else (self.repo_root / p)

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_intra_op_threads(self) -> int:
        if self.intra_op_threads > 0:
            return self.intra_op_threads
        return max(1, min(4, os.cpu_count() or 1))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

