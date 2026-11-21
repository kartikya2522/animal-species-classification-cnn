"""Groq key resolution: blank values count as unset, WILDLENS_GROQ_API_KEY beats GROQ_API_KEY."""
from __future__ import annotations

import pytest

from app.config import Settings


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ("WILDLENS_GROQ_API_KEY", "GROQ_API_KEY"):
        monkeypatch.delenv(name, raising=False)


def providers(s: Settings):
    from app.services.chat.service import ChatService

    return [type(p).__name__ for p in ChatService(s, retriever=None, http=None).llm_providers()]


def key(s: Settings):
    return s.groq_api_key.get_secret_value() if s.groq_api_key is not None else None


def test_empty_wildlens_key_in_env_file_does_not_hide_groq_key(tmp_path):
    env = tmp_path / ".env"
    env.write_text("WILDLENS_GROQ_API_KEY=\nGROQ_API_KEY=gsk_fallback\n")
    s = Settings(_env_file=env, ollama_url=None)
    assert key(s) == "gsk_fallback"
    assert providers(s) == ["GroqProvider"]


def test_empty_wildlens_key_in_environment_does_not_hide_groq_key(monkeypatch):
    monkeypatch.setenv("WILDLENS_GROQ_API_KEY", "   ")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_fallback")
    assert key(Settings(_env_file=None)) == "gsk_fallback"


def test_groq_key_in_env_file_used_when_wildlens_blank_in_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("WILDLENS_GROQ_API_KEY", "")
    env = tmp_path / ".env"
    env.write_text("GROQ_API_KEY=gsk_from_file\n")
    assert key(Settings(_env_file=env)) == "gsk_from_file"


def test_wildlens_key_wins_when_set(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("WILDLENS_GROQ_API_KEY=gsk_primary\nGROQ_API_KEY=gsk_fallback\n")
    assert key(Settings(_env_file=env)) == "gsk_primary"
    monkeypatch.setenv("WILDLENS_GROQ_API_KEY", " gsk_env ")
    assert key(Settings(_env_file=None)) == "gsk_env"


def test_both_empty_means_no_llm(tmp_path):
    env = tmp_path / ".env"
    env.write_text("WILDLENS_GROQ_API_KEY=\nGROQ_API_KEY=  \n")
    s = Settings(_env_file=env, ollama_url=None)
    assert s.groq_api_key is None
    assert providers(s) == []


def test_key_never_appears_in_repr(tmp_path):
    env = tmp_path / ".env"
    env.write_text("GROQ_API_KEY=gsk_secret_value\n")
    assert "gsk_secret_value" not in repr(Settings(_env_file=env))
