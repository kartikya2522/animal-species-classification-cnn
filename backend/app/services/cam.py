"""Class activation maps (CAM) from the ONNX ``features`` output + fc weights.

For a ``last conv features -> global-avg-pool -> (dropout) -> Linear`` head, Grad-CAM equals CAM up to a
positive constant (verified in tests/phase0/test_cam.py):

    heatmap_c = ReLU( sum_k W_fc[c, k] * A_k )      # A = features, (K, 7, 7)

The map is normalised to [0, 1] at grid resolution and bilinearly upsampled to
the output size (the model saw the image stretched to 224x224, so stretching
the grid back over the original image is the exact inverse mapping), then
re-normalised so the rendered map spans exactly [0, 1].

Colormaps are small NumPy lookup tables: no matplotlib/OpenCV dependency.
"""
from __future__ import annotations

import base64
import io
from typing import Dict, Tuple

import numpy as np
from PIL import Image

COLORMAPS = ("jet", "amber")


def compute_cam(features: np.ndarray, fc_weight: np.ndarray, class_index: int) -> np.ndarray:
    """features (K, h, w), fc_weight (C, K) -> ReLU CAM (h, w), float32, unnormalised."""
    cam = np.tensordot(fc_weight[class_index].astype(np.float32), features, axes=1)
    return np.maximum(cam, 0.0).astype(np.float32)


def normalize(cam: np.ndarray) -> np.ndarray:
    lo, hi = float(cam.min()), float(cam.max())
    if hi - lo <= 1e-12:
        return np.zeros_like(cam, dtype=np.float32)
    return ((cam - lo) / (hi - lo)).astype(np.float32)


def upsample(cam01: np.ndarray, size: Tuple[int, int]) -> np.ndarray:
    """(h, w) in [0,1] -> (H, W) bilinear, size given as (W, H) like PIL."""
    up = Image.fromarray(np.ascontiguousarray(cam01, dtype=np.float32)).resize(size, Image.BILINEAR)
    return np.clip(np.asarray(up, dtype=np.float32), 0.0, 1.0)


def _build_lut(name: str) -> np.ndarray:
    x = np.linspace(0.0, 1.0, 256, dtype=np.float32)
    if name == "jet":
        r = np.clip(1.5 - np.abs(4.0 * x - 3.0), 0.0, 1.0)
        g = np.clip(1.5 - np.abs(4.0 * x - 2.0), 0.0, 1.0)
        b = np.clip(1.5 - np.abs(4.0 * x - 1.0), 0.0, 1.0)
        rgb = np.stack([r, g, b], axis=1)
    elif name == "amber":
        # Site palette: deep forest -> moss -> ochre/amber accent -> pale highlight.
        stops = np.array([0.0, 0.35, 0.75, 1.0], dtype=np.float32)
        colors = np.array(
            [[0x0F, 0x1F, 0x17], [0x2F, 0x4A, 0x3A], [0xC8, 0x91, 0x3A], [0xF6, 0xE3, 0xB4]],
            dtype=np.float32,
        ) / 255.0
        rgb = np.stack([np.interp(x, stops, colors[:, c]) for c in range(3)], axis=1)
    else:
        raise ValueError(f"unknown colormap {name!r}; choose from {COLORMAPS}")
    return (rgb * 255.0 + 0.5).astype(np.uint8)


_LUTS: Dict[str, np.ndarray] = {name: _build_lut(name) for name in COLORMAPS}


def colorize(heat01: np.ndarray, colormap: str = "jet") -> np.ndarray:
    """(H, W) in [0,1] -> (H, W, 3) uint8."""
    idx = np.clip(np.rint(heat01 * 255.0), 0, 255).astype(np.uint8)
    return _LUTS[colormap][idx]


def overlay(img: Image.Image, heat01: np.ndarray, colormap: str, alpha: float) -> Image.Image:
    """Blend the colourised heatmap over ``img`` (same size) with constant alpha."""
    base = np.asarray(img.convert("RGB"), dtype=np.float32)
    color = colorize(heat01, colormap).astype(np.float32)
    out = (1.0 - alpha) * base + alpha * color
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def png_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False, compress_level=6)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def fit_within(size: Tuple[int, int], max_side: int) -> Tuple[int, int]:
    w, h = size
    scale = min(1.0, max_side / float(max(w, h)))
    return max(1, int(round(w * scale))), max(1, int(round(h * scale)))
