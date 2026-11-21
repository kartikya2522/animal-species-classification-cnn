from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import Settings
from app.deps import get_metrics, get_settings
from app.schemas import ErrorResponse, FigureInfo, FiguresResponse, MetricsResponse

router = APIRouter(tags=["research"])

# Strict allow-list: plain file names only, PNG only, no dots/slashes beyond the extension.
FIGURE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-]{0,127}\.png$")


def list_figure_names(figures_dir: Path) -> List[str]:
    if not figures_dir.is_dir():
        return []
    return sorted(
        p.name for p in figures_dir.iterdir() if p.is_file() and FIGURE_NAME_RE.match(p.name)
    )


@router.get(
    "/metrics",
    response_model=MetricsResponse,
    summary="Training/evaluation metrics for all models",
    description="Normalised view of `outputs/results/*` (JSON + history CSVs), keyed by model id. "
    "Fields a model's files do not provide are `null`; original JSON is under `raw`.",
)
def metrics(data: Dict[str, Any] = Depends(get_metrics)) -> MetricsResponse:
    return MetricsResponse(models=data)


@router.get("/figures", response_model=FiguresResponse, summary="List figure PNGs")
def figures(
    settings: Settings = Depends(get_settings),
    data: Dict[str, Any] = Depends(get_metrics),
) -> FiguresResponse:
    d = settings.resolve(settings.figures_dir)
    out = []
    for name in list_figure_names(d):
        owner = next((mid for mid in data if name.startswith(mid + "_")), None)
        out.append(
            FigureInfo(name=name, url=f"/api/figures/{name}", model=owner, size_bytes=(d / name).stat().st_size)
        )
    return FiguresResponse(figures=out)


@router.get(
    "/figures/{name}",
    summary="Get one figure PNG",
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}}}, 404: {"model": ErrorResponse}},
)
def figure(name: str, settings: Settings = Depends(get_settings)) -> FileResponse:
    d = settings.resolve(settings.figures_dir)
    # Only names that are both well-formed and actually listed in the directory are served;
    # the path is rebuilt from the listed name, never from user input joined blindly.
    if not FIGURE_NAME_RE.match(name) or name not in list_figure_names(d):
        raise HTTPException(status_code=404, detail=f"Figure {name!r} not found.")
    return FileResponse(
        d / name, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"}
    )
