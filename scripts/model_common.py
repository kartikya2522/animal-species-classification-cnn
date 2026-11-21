"""Shared helpers for Phase-0 scripts and tests (paths, manifest, torch model)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = PROJECT_ROOT / "models"
MANIFEST_PATH = PROJECT_ROOT / "data" / "manifest.csv"
CKPT_PATH = PROJECT_ROOT / "outputs" / "models" / "efficientnetv2_s.pth"

ONNX_PATH = MODELS_DIR / "efficientnetv2_s.onnx"
ONNX_INT8_PATH = MODELS_DIR / "efficientnetv2_s.int8.onnx"
ONNX_FP16_PATH = MODELS_DIR / "efficientnetv2_s.fp16.onnx"
CLASSES_PATH = MODELS_DIR / "classes.json"
FC_NPZ_PATH = MODELS_DIR / "efficientnetv2_s_fc.npz"
FC_JSON_PATH = MODELS_DIR / "efficientnetv2_s_fc.json"
REGISTRY_PATH = MODELS_DIR / "registry.json"
EVAL_PATH = MODELS_DIR / "efficientnetv2_s_onnx_eval.json"


def load_split(split: str) -> pd.DataFrame:
    """Rows of data/manifest.csv for `split`, with POSIX absolute filepaths."""
    df = pd.read_csv(MANIFEST_PATH)
    df = df[df["split"] == split].reset_index(drop=True)
    df["filepath"] = [
        str(PROJECT_ROOT / p.replace("\\", "/")) for p in df["filepath"]
    ]
    return df


def class_list(split: str = "test") -> list[str]:
    """Same rule as src/utils/dataset.py: sorted unique labels of the split."""
    return sorted(load_split(split)["label"].unique())


def load_classes() -> list[str]:
    return json.loads(CLASSES_PATH.read_text())


def build_torch_model():
    """EfficientNetV2-S (80 classes) from the saved state_dict, eval mode, CPU."""
    import torch
    import torchvision

    sd = torch.load(CKPT_PATH, map_location="cpu", weights_only=True)
    if "model_state" in sd:          # tolerate a wrapped checkpoint
        sd = sd["model_state"]
    model = torchvision.models.efficientnet_v2_s(weights=None, num_classes=80)
    model.load_state_dict(sd, strict=True)   # fails loudly on any mismatch
    model.eval()
    return model, {}
