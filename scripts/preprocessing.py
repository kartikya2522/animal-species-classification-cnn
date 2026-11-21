"""
Re-export shim. The canonical, torch-free preprocessing now lives in the backend
package: backend/app/services/preprocessing.py (moved there in Phase 1).

Kept so the Phase-0 scripts (export_onnx.py, evaluate_onnx.py) and tests/phase0
can keep doing `from preprocessing import ...` with scripts/ on sys.path.
Importing it pulls in only backend/app/__init__.py and app/services/__init__.py,
which are deliberately import-free (no FastAPI/onnxruntime needed).
"""
from __future__ import annotations

import sys
from pathlib import Path

_BACKEND_DIR = str(Path(__file__).resolve().parents[1] / "backend")
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.services.preprocessing import (  # noqa: E402
    DEFAULT_MEAN,
    DEFAULT_SIZE,
    DEFAULT_STD,
    load_image,
    preprocess_batch,
    preprocess_image,
)

__all__ = [
    "DEFAULT_MEAN",
    "DEFAULT_SIZE",
    "DEFAULT_STD",
    "load_image",
    "preprocess_batch",
    "preprocess_image",
]
