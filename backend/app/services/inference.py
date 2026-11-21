"""ONNX Runtime inference.

One ``InferenceSession`` per model, created once at startup and shared by all
requests. ``InferenceSession.run`` is thread-safe, so FastAPI's threadpool can
call it concurrently without a lock. Each run returns ``logits`` and
``features`` together, so /api/explain needs a single forward pass.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

from app.services.preprocessing import preprocess_image
from app.services.registry import ModelSpec, Registry

log = logging.getLogger(__name__)


@dataclass
class InferenceResult:
    probabilities: np.ndarray  # (C,) float64, sums to 1
    logits: np.ndarray  # (C,) float32
    features: Optional[np.ndarray]  # (K, h, w) float32, e.g. (1280, 7, 7)
    inference_ms: float  # preprocessing + forward pass + softmax

    def top_k(self, k: int) -> List[Tuple[int, float]]:
        k = max(1, min(k, self.probabilities.shape[0]))
        # stable sort: ties resolved by class index, deterministic output
        idx = np.argsort(-self.probabilities, kind="stable")[:k]
        return [(int(i), float(self.probabilities[i])) for i in idx]


def softmax(logits: np.ndarray) -> np.ndarray:
    z = logits.astype(np.float64)
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


class OnnxModel:
    def __init__(self, spec: ModelSpec, intra_op_threads: int) -> None:
        import onnxruntime as ort

        if spec.input_size[0] != spec.input_size[1]:
            raise ValueError(f"{spec.id}: only square input sizes are supported")
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = intra_op_threads
        opts.inter_op_num_threads = 1
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.spec = spec
        self.session = ort.InferenceSession(
            str(spec.onnx_path), sess_options=opts, providers=["CPUExecutionProvider"]
        )
        outputs = {o.name for o in self.session.get_outputs()}
        if "logits" not in outputs:
            raise ValueError(f"{spec.id}: ONNX model has no 'logits' output")
        self.output_names = ["logits"] + (["features"] if "features" in outputs else [])
        fc = spec.load_fc()
        self.fc_weight: Optional[np.ndarray] = fc[0] if fc else None
        self.fc_bias: Optional[np.ndarray] = fc[1] if fc else None

    @property
    def supports_cam(self) -> bool:
        return "features" in self.output_names and self.fc_weight is not None

    def warmup(self) -> None:
        s = self.spec.input_size[0]
        self.session.run(self.output_names, {self.spec.input_name: np.zeros((1, 3, s, s), np.float32)})

    def run(self, img: Image.Image) -> InferenceResult:
        t0 = time.perf_counter()
        x = preprocess_image(
            img, size=self.spec.input_size[0], mean=self.spec.mean, std=self.spec.std
        )[None]
        out = self.session.run(self.output_names, {self.spec.input_name: x})
        logits = out[0][0]
        features = out[1][0] if len(out) > 1 else None
        probs = softmax(logits)
        ms = (time.perf_counter() - t0) * 1000.0
        return InferenceResult(probs, logits, features, ms)


class ModelManager:
    """Holds the loaded sessions; models whose ONNX file is missing are skipped."""

    def __init__(self, registry: Registry, intra_op_threads: int) -> None:
        self.registry = registry
        self.loaded: Dict[str, OnnxModel] = {}
        self.errors: Dict[str, str] = {}
        for model_id, spec in registry.models.items():
            if not spec.onnx_available:
                self.errors[model_id] = f"ONNX file not found: {spec.onnx_path.name}"
                log.warning("model %s not loaded: %s missing", model_id, spec.onnx_path)
                continue
            try:
                m = OnnxModel(spec, intra_op_threads)
                m.warmup()
                self.loaded[model_id] = m
                log.info("loaded model %s (%s)", model_id, spec.onnx_path.name)
            except Exception as exc:  # keep serving other models / metadata
                self.errors[model_id] = f"failed to load: {exc}"
                log.exception("failed to load model %s", model_id)

    def is_known(self, model_id: str) -> bool:
        return model_id in self.registry.models

    def get(self, model_id: str) -> Optional[OnnxModel]:
        return self.loaded.get(model_id)
