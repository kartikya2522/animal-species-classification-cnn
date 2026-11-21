"""Request-scoped accessors for objects created in the app lifespan."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import Request

from app.config import Settings
from app.services.chat.service import ChatService
from app.services.inference import ModelManager
from app.services.knowledge import SpeciesKB


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_manager(request: Request) -> ModelManager:
    return request.app.state.manager


def get_metrics(request: Request) -> Dict[str, Any]:
    return request.app.state.metrics


def get_kb(request: Request) -> SpeciesKB:
    return request.app.state.kb


def get_chat(request: Request) -> ChatService:
    return request.app.state.chat
