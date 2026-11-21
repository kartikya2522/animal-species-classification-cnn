"""Model registry: reads models/registry.json (+ classes, fc weights).

Adding a model later = export it and add one entry to registry.json; nothing
here is model-specific. Only variants marked ``usable: true`` are served,
preferring ``fp32`` (the Phase-0 int8 variant is ``usable: false``).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.config import Settings


@dataclass
class ModelSpec:
    id: str
    display_name: str
    architecture: str
    onnx_path: Path
    variant: str
    classes: List[str]
    input_name: str
    input_size: Tuple[int, int]
    mean: Tuple[float, float, float]
    std: Tuple[float, float, float]
    fc_npz_path: Optional[Path]
    metrics_paths: Dict[str, Path] = field(default_factory=dict)
    cam_method: str = ""

    @property
    def num_classes(self) -> int:
        return len(self.classes)

    @property
    def onnx_available(self) -> bool:
        return self.onnx_path.is_file()

    def load_fc(self) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        """(weight (C, K) float32, bias (C,) float32) for CAM, or None."""
        if self.fc_npz_path is None or not self.fc_npz_path.is_file():
            return None
        with np.load(self.fc_npz_path) as fc:
            return fc["weight"].astype(np.float32), fc["bias"].astype(np.float32)


@dataclass
class Registry:
    default: str
    models: Dict[str, ModelSpec]

    def get(self, model_id: str) -> ModelSpec:
        return self.models[model_id]


def _pick_variant(entry: Dict[str, Any]) -> Tuple[str, str]:
    variants = entry.get("variants") or {}
    usable = {k: v for k, v in variants.items() if v.get("usable", False)}
    if "fp32" in usable:
        return "fp32", usable["fp32"]["onnx"]
    if usable:
        name = sorted(usable)[0]
        return name, usable[name]["onnx"]
    if "onnx" in entry:
        return "default", entry["onnx"]
    raise ValueError(f"model {entry.get('id')!r} has no usable ONNX variant")


def load_registry(settings: Settings) -> Registry:
    path = settings.resolve(settings.registry_path)
    raw = json.loads(path.read_text())
    models: Dict[str, ModelSpec] = {}
    for entry in raw["models"]:
        variant, onnx_rel = _pick_variant(entry)
        classes = json.loads(settings.resolve(Path(entry["classes"])).read_text())
        if entry.get("num_classes") not in (None, len(classes)):
            raise ValueError(f"{entry['id']}: num_classes != len(classes)")
        fc = (entry.get("fc") or {}).get("npz")
        size = entry.get("input_size", [224, 224])
        models[entry["id"]] = ModelSpec(
            id=entry["id"],
            display_name=entry.get("display_name", entry["id"]),
            architecture=entry.get("architecture", ""),
            onnx_path=settings.resolve(Path(onnx_rel)),
            variant=variant,
            classes=classes,
            input_name=(entry.get("inputs") or {}).get("name", "input"),
            input_size=(int(size[0]), int(size[1])),
            mean=tuple(entry["mean"]),
            std=tuple(entry["std"]),
            fc_npz_path=settings.resolve(Path(fc)) if fc else None,
            metrics_paths={k: settings.resolve(Path(v)) for k, v in (entry.get("metrics") or {}).items()},
            cam_method=(entry.get("cam") or {}).get("method", ""),
        )
    default = raw.get("default") or next(iter(models))
    if default not in models:
        raise ValueError(f"default model {default!r} not in registry")
    return Registry(default=default, models=models)
