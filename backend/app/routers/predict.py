"""POST /api/predict and POST /api/explain (multipart image upload)."""
from __future__ import annotations

import time
from typing import Dict, Literal, Optional, Tuple

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image

from app.config import Settings
from app.deps import get_kb, get_manager, get_settings
from app.schemas import ErrorResponse, ExplainResponse, ImageInfo, Prediction, PredictResponse
from app.services import cam
from app.services.images import ImageValidationError, decode_image
from app.services.inference import InferenceResult, ModelManager, OnnxModel
from app.services.knowledge import SpeciesKB

router = APIRouter(tags=["inference"])

MAX_TOP_K = 10

ERROR_RESPONSES = {
    404: {"model": ErrorResponse, "description": "Unknown model id."},
    413: {"model": ErrorResponse, "description": "Upload larger than the configured limit (default 10 MB)."},
    415: {"model": ErrorResponse, "description": "Decodable image, but not JPEG/PNG/WebP."},
    422: {"description": "Undecodable/corrupt image, or invalid form fields (e.g. top_k out of range)."},
    503: {"model": ErrorResponse, "description": "Model is registered but its ONNX file is not loaded."},
}

FILE_FIELD = File(..., description="Image file: JPEG, PNG or WebP (validated by decoding). Max 10 MB by default.")
MODEL_FIELD = Form(None, description="Model id from `GET /api/models`. Defaults to the registry default.")


def _load_request(
    file: UploadFile, model_id: Optional[str], settings: Settings, manager: ModelManager
) -> Tuple[OnnxModel, Image.Image, str]:
    limit = settings.max_upload_bytes
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=413, detail=f"File too large; the limit is {settings.max_upload_mb:g} MB."
        )
    model_id = model_id or manager.registry.default
    if not manager.is_known(model_id):
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model {model_id!r}. Available: {', '.join(manager.registry.models)}.",
        )
    try:
        img, fmt = decode_image(data, settings.max_image_pixels)
    except ImageValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    loaded = manager.get(model_id)
    if loaded is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model {model_id!r} is not loaded ({manager.errors.get(model_id, 'unknown error')}).",
        )
    return loaded, img, fmt


def _predictions(model: OnnxModel, result: InferenceResult, k: int):
    classes = model.spec.classes
    return [Prediction(label=classes[i], index=i, probability=p) for i, p in result.top_k(k)]


def _slugs(kb: SpeciesKB, labels) -> Dict[str, str]:
    """label -> species slug, for linking predictions to the atlas (additive field)."""
    out = {}
    for label in labels:
        slug = kb.slug_for_label(label)
        if slug:
            out[label] = slug
    return out


@router.post(
    "/predict",
    response_model=PredictResponse,
    responses=ERROR_RESPONSES,
    summary="Classify an animal photo",
    description="Returns the top-k species with softmax probabilities, the server-side inference time, and "
    "a `low_confidence` flag (top-1 probability below the configured threshold).",
)
def predict(
    file: UploadFile = FILE_FIELD,
    model: Optional[str] = MODEL_FIELD,
    top_k: int = Form(5, ge=1, le=MAX_TOP_K, description="Number of classes to return (1-10)."),
    settings: Settings = Depends(get_settings),
    manager: ModelManager = Depends(get_manager),
    kb: SpeciesKB = Depends(get_kb),
) -> PredictResponse:
    m, img, fmt = _load_request(file, model, settings, manager)
    result = m.run(img)
    preds = _predictions(m, result, top_k)
    thr = settings.low_confidence_threshold
    return PredictResponse(
        model=m.spec.id,
        predictions=preds,
        low_confidence=preds[0].probability < thr,
        low_confidence_threshold=thr,
        inference_ms=round(result.inference_ms, 2),
        image=ImageInfo(width=img.width, height=img.height, format=fmt),
        slugs=_slugs(kb, [p.label for p in preds]),
    )


@router.post(
    "/explain",
    response_model=ExplainResponse,
    responses=ERROR_RESPONSES,
    summary="Explain a prediction with a class activation map",
    description="Runs one forward pass (logits + last-conv features) and returns a CAM heatmap for `class_index` "
    "(default: the top-1 class) as two base64 PNGs at the uploaded image's size (longest side capped, "
    "default 1024 px): a colourised overlay and the raw 8-bit grayscale heatmap. For this GAP->Linear head "
    "CAM is mathematically identical to Grad-CAM (dropout is a no-op at inference).",
)
def explain(
    file: UploadFile = FILE_FIELD,
    model: Optional[str] = MODEL_FIELD,
    class_index: Optional[int] = Form(
        None, ge=0, description="Class to explain (index into the model's class list). Default: top-1."
    ),
    colormap: Literal["jet", "amber"] = Form("jet", description="Overlay colormap: `jet` or the site `amber`."),
    settings: Settings = Depends(get_settings),
    manager: ModelManager = Depends(get_manager),
    kb: SpeciesKB = Depends(get_kb),
) -> ExplainResponse:
    m, img, fmt = _load_request(file, model, settings, manager)
    if not m.supports_cam:
        raise HTTPException(status_code=501, detail=f"Model {m.spec.id!r} does not support explanations.")
    if class_index is not None and class_index >= m.spec.num_classes:
        raise HTTPException(
            status_code=422, detail=f"class_index must be in [0, {m.spec.num_classes - 1}]."
        )
    result = m.run(img)
    preds = _predictions(m, result, 5)
    cls = preds[0].index if class_index is None else class_index

    t0 = time.perf_counter()
    grid = cam.normalize(cam.compute_cam(result.features, m.fc_weight, cls))
    size = cam.fit_within(img.size, settings.explain_max_side)
    base = img if img.size == size else img.resize(size, Image.BILINEAR)
    heat = cam.normalize(cam.upsample(grid, size))  # plan: upsample -> normalise to [0,1]
    overlay_png = cam.png_base64(cam.overlay(base, heat, colormap, settings.overlay_alpha))
    heatmap_png = cam.png_base64(Image.fromarray(np.clip(np.rint(heat * 255.0), 0, 255).astype(np.uint8)))
    explain_ms = (time.perf_counter() - t0) * 1000.0

    return ExplainResponse(
        model=m.spec.id,
        class_index=cls,
        label=m.spec.classes[cls],
        probability=float(result.probabilities[cls]),
        predicted=preds[0],
        predictions=preds,
        low_confidence=preds[0].probability < settings.low_confidence_threshold,
        low_confidence_threshold=settings.low_confidence_threshold,
        method="CAM (== Grad-CAM for this GAP->Linear head), last conv block",
        colormap=colormap,
        width=size[0],
        height=size[1],
        image=ImageInfo(width=img.width, height=img.height, format=fmt),
        overlay_png=overlay_png,
        heatmap_png=heatmap_png,
        grid=[[round(float(v), 4) for v in row] for row in grid],
        inference_ms=round(result.inference_ms, 2),
        explain_ms=round(explain_ms, 2),
        slugs=_slugs(kb, [p.label for p in preds] + [m.spec.classes[cls]]),
    )
