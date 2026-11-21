from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.deps import get_manager, get_metrics
from app.schemas import ModelInfo, ModelsResponse, TestMetricsSummary
from app.services.inference import ModelManager

router = APIRouter(tags=["models"])


@router.get(
    "/models",
    response_model=ModelsResponse,
    summary="Registered models",
    description="Models from `models/registry.json`, whether each is loaded, and a test-set metrics summary "
    "from `outputs/results`.",
)
def list_models(
    manager: ModelManager = Depends(get_manager),
    metrics: Dict[str, Any] = Depends(get_metrics),
) -> ModelsResponse:
    reg = manager.registry
    out = []
    for mid, spec in reg.models.items():
        loaded = manager.get(mid)
        summary = (metrics.get(mid) or {}).get("summary", {})
        out.append(
            ModelInfo(
                id=mid,
                display_name=spec.display_name,
                architecture=spec.architecture,
                variant=spec.variant,
                num_classes=spec.num_classes,
                input_size=list(spec.input_size),
                loaded=loaded is not None,
                supports_explain=bool(loaded and loaded.supports_cam),
                is_default=mid == reg.default,
                test_metrics=TestMetricsSummary(**{k: summary.get(k) for k in TestMetricsSummary.model_fields}),
            )
        )
    return ModelsResponse(default=reg.default, models=out)
