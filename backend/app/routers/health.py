from __future__ import annotations

from fastapi import APIRouter, Depends

from app import __version__
from app.deps import get_manager
from app.schemas import HealthResponse, ModelStatus
from app.services.inference import ModelManager

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Service health and loaded models")
def health(manager: ModelManager = Depends(get_manager)) -> HealthResponse:
    reg = manager.registry
    return HealthResponse(
        status="ok" if manager.get(reg.default) is not None else "degraded",
        version=__version__,
        default_model=reg.default,
        models=[
            ModelStatus(id=mid, loaded=mid in manager.loaded, error=manager.errors.get(mid))
            for mid in reg.models
        ],
    )
