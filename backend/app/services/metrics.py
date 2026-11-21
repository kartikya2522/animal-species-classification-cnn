"""Normalises outputs/results/* into one stable shape keyed by model id.

The four models' result files have different shapes (they came from different
training scripts):

* ``<id>_results.json``    ResNet50 / ConvNeXt: hparams, per_class_accuracy, test_accuracy, ...
* ``<id>_evaluation.json`` ResNet50: macro P/R/F1/AUC, figure paths (absolute -> basenames)
* ``<id>_metrics.json``    EfficientNetV2-S / Swin: flat metrics + embedded ``history``
* ``<id>_history.csv``     per-epoch curves (ResNet50 / ConvNeXt)
* ``<id>_precision_recall_f1.csv`` per-class P/R/F1 (ConvNeXt)

Every model gets the same keys; values that a model's files do not provide are
``null``. The untouched file contents are also returned under ``raw`` (with
absolute local paths reduced to file names).
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

JSON_SUFFIXES = ("_results.json", "_evaluation.json", "_metrics.json")
CSV_SUFFIXES = ("_history.csv", "_precision_recall_f1.csv")
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_]*$")

DISPLAY_NAMES = {
    "resnet50": "ResNet50",
    "efficientnetv2_s": "EfficientNetV2-S",
    "convnext_tiny": "ConvNeXt-Tiny",
    "swin_tiny": "Swin-Tiny",
}

# summary key -> candidate source keys, in priority order
SUMMARY_KEYS: Dict[str, List[str]] = {
    "test_accuracy": ["test_accuracy", "test_top1_accuracy"],
    "test_top5_accuracy": ["test_top5_accuracy"],
    "best_val_accuracy": ["best_val_accuracy", "checkpoint_val_acc"],
    "macro_precision": ["test_precision_macro", "macro_precision"],
    "macro_recall": ["test_recall_macro", "macro_recall"],
    "macro_f1": ["test_f1_macro", "macro_f1"],
    "macro_roc_auc": ["test_auc_macro_ovr", "macro_roc_auc"],
    "macro_avg_class_accuracy": ["macro_avg_accuracy"],
    "total_params": ["total_params", "total_parameters"],
    "avg_inference_ms_per_image": ["avg_inference_time_ms_per_image"],
    "best_epoch": ["best_epoch", "checkpoint_epoch"],
    "epochs": ["num_epochs", "hparams.epochs"],
    "batch_size": ["batch_size", "hparams.batch_size"],
    "learning_rate": ["learning_rate", "hparams.lr"],
    "optimizer": ["optimizer", "hparams.optimizer"],
    "test_samples": ["test_samples"],
}


def _num(v: str) -> Any:
    try:
        f = float(v)
    except ValueError:
        return v
    return int(f) if f.is_integer() and "." not in v and "e" not in v.lower() else f


def _read_csv_columns(path: Path) -> Dict[str, List[Any]]:
    with path.open(newline="") as fh:
        rows = list(csv.DictReader(fh))
    cols: Dict[str, List[Any]] = {}
    for row in rows:
        for k, v in row.items():
            cols.setdefault(k, []).append(_num(v))
    return cols


def _read_csv_rows(path: Path) -> List[Dict[str, Any]]:
    with path.open(newline="") as fh:
        return [{k: _num(v) for k, v in row.items()} for row in csv.DictReader(fh)]


def _strip_local_paths(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _strip_local_paths(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_strip_local_paths(v) for v in obj]
    # Absolute local paths, and repo-relative output paths ("outputs/figures/x.png"), -> file names.
    if isinstance(obj, str) and (obj.startswith(("/", "outputs/", "outputs\\")) or re.match(r"^[A-Za-z]:\\", obj)):
        return re.split(r"[\\/]", obj)[-1]
    return obj


def _lookup(sources: List[Dict[str, Any]], dotted: str) -> Any:
    for src in sources:
        cur: Any = src
        for part in dotted.split("."):
            if not isinstance(cur, dict) or part not in cur:
                cur = None
                break
            cur = cur[part]
        if cur is not None:
            return cur
    return None


def _model_id(name: str, suffixes) -> Optional[str]:
    for suf in suffixes:
        if name.endswith(suf):
            mid = name[: -len(suf)]
            return mid if _ID_RE.match(mid) else None
    return None


def load_metrics(results_dir: Path, figure_names: List[str]) -> Dict[str, Any]:
    raw: Dict[str, Dict[str, Any]] = {}
    csvs: Dict[str, Dict[str, Path]] = {}
    if results_dir.is_dir():
        for p in sorted(results_dir.iterdir()):
            mid = _model_id(p.name, JSON_SUFFIXES)
            if mid:
                try:
                    raw.setdefault(mid, {})[p.name] = _strip_local_paths(json.loads(p.read_text()))
                except (OSError, ValueError):
                    continue
                continue
            mid = _model_id(p.name, CSV_SUFFIXES)
            if mid:
                csvs.setdefault(mid, {})[p.name[len(mid) + 1 :]] = p

    models: Dict[str, Any] = {}
    for mid in sorted(set(raw) | set(csvs)):
        files = raw.get(mid, {})
        # priority: results.json, metrics.json, evaluation.json
        ordered = [
            files[mid + suf]
            for suf in ("_results.json", "_metrics.json", "_evaluation.json")
            if mid + suf in files
        ]
        summary: Dict[str, Any] = {
            key: next((v for v in (_lookup(ordered, c) for c in cands) if v is not None), None)
            for key, cands in SUMMARY_KEYS.items()
        }
        train_time_min = _lookup(ordered, "training_time_minutes")
        if train_time_min is None:
            secs = _lookup(ordered, "total_train_time_s")
            train_time_min = round(secs / 60.0, 2) if isinstance(secs, (int, float)) else None
        summary["train_time_minutes"] = train_time_min

        history: Optional[Dict[str, List[Any]]] = None
        if "history.csv" in csvs.get(mid, {}):
            history = _read_csv_columns(csvs[mid]["history.csv"])
        else:
            h = _lookup(ordered, "history")
            if isinstance(h, dict) and h:
                n = max(len(v) for v in h.values() if isinstance(v, list))
                history = {"epoch": list(range(1, n + 1)), **h}

        per_class_prf = None
        if "precision_recall_f1.csv" in csvs.get(mid, {}):
            per_class_prf = _read_csv_rows(csvs[mid]["precision_recall_f1.csv"])

        sources = sorted(files) + sorted(f"{mid}_{n}" for n in csvs.get(mid, {}))
        models[mid] = {
            "id": mid,
            "display_name": DISPLAY_NAMES.get(mid, mid),
            "summary": summary,
            "hparams": _lookup(ordered, "hparams"),
            "per_class_accuracy": _lookup(ordered, "per_class_accuracy"),
            "per_class_prf": per_class_prf,
            "history": history,
            "figures": [f for f in figure_names if f.startswith(mid + "_")],
            "sources": sources,
            "raw": files,
        }
    return models
