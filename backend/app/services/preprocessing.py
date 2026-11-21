"""
Framework-free image preprocessing (Pillow + NumPy only, no torch/torchvision).

Reproduces the eval transform used in training (src/utils/transforms.py):
    Resize((224, 224))  -> PIL bilinear
    ToTensor()          -> HWC uint8 -> CHW float32 in [0, 1]
    Normalize(mean,std) -> dataset mean/std from src/utils/config.py

Canonical location (moved from scripts/preprocessing.py in Phase 1; that file is
now a thin re-export shim for the Phase-0 scripts and tests). Must stay free of
torch imports: imports are restricted to __future__/typing/numpy/PIL, which
tests/phase0/test_preprocessing.py enforces. Parity with torchvision is checked
in tests/phase0.
"""
from __future__ import annotations

from typing import Sequence

import numpy as np
from PIL import Image

DEFAULT_SIZE = 224
DEFAULT_MEAN = (0.46290031, 0.44127762, 0.38908589)
DEFAULT_STD = (0.26581346, 0.2520165, 0.25977104)


def preprocess_image(
    img: Image.Image,
    size: int = DEFAULT_SIZE,
    mean: Sequence[float] = DEFAULT_MEAN,
    std: Sequence[float] = DEFAULT_STD,
) -> np.ndarray:
    """PIL image -> float32 array of shape (3, size, size)."""
    img = img.convert("RGB")
    # torchvision.transforms.Resize on a PIL image calls PIL's resize with
    # BILINEAR (antialias is implicit for PIL). Same-size input is a no-op copy.
    if img.size != (size, size):
        img = img.resize((size, size), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0  # HWC
    arr = (arr - np.asarray(mean, dtype=np.float32)) / np.asarray(std, dtype=np.float32)
    return np.ascontiguousarray(arr.transpose(2, 0, 1), dtype=np.float32)


def preprocess_batch(images, **kwargs) -> np.ndarray:
    """List of PIL images -> (N, 3, H, W) float32."""
    return np.stack([preprocess_image(im, **kwargs) for im in images])


def load_image(path) -> Image.Image:
    with Image.open(path) as im:
        return im.convert("RGB")
