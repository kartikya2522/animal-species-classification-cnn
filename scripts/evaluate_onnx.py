"""
Phase 0: evaluate the exported ONNX model(s) on the full test split using the
NumPy/PIL-only preprocessing (scripts/preprocessing.py) and onnxruntime.

- FP32 top-1 / top-5 accuracy, compared with outputs/results/efficientnetv2_s_metrics.json
- int8 / fp16 variants (if present): accuracy + top-1 agreement with FP32;
  marked usable iff agreement >= 0.99
Writes models/efficientnetv2_s_onnx_eval.json and refreshes models/registry.json.

Usage (from repo root):
    venv/bin/python scripts/evaluate_onnx.py [--limit N]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_common import (  # noqa: E402
    EVAL_PATH, ONNX_FP16_PATH, ONNX_INT8_PATH, ONNX_PATH, PROJECT_ROOT, REGISTRY_PATH, load_classes, load_split,
)
from preprocessing import load_image, preprocess_batch  # noqa: E402

AGREEMENT_THRESHOLD = 0.99
TOLERANCE = 0.001


def run(session: ort.InferenceSession, paths, batch: int = 64) -> np.ndarray:
    out = []
    for i in range(0, len(paths), batch):
        x = preprocess_batch([load_image(p) for p in paths[i:i + batch]])
        out.append(session.run(["logits"], {"input": x})[0])
    return np.concatenate(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    classes = load_classes()
    df = load_split("test")
    if args.limit:
        df = df.iloc[: args.limit]
    idx = {c: i for i, c in enumerate(classes)}
    y = df["label"].map(idx).to_numpy()
    paths = df["filepath"].tolist()

    reported = json.loads((PROJECT_ROOT / "outputs/results/efficientnetv2_s_metrics.json").read_text())
    reported_acc = reported["test_accuracy"]

    so = ort.SessionOptions()
    result = {"split": "test", "n_images": len(paths), "preprocessing": "scripts/preprocessing.py",
              "reported_test_accuracy": reported_acc}

    t = time.time()
    fp32 = ort.InferenceSession(str(ONNX_PATH), so, providers=["CPUExecutionProvider"])
    logits = run(fp32, paths)
    pred = logits.argmax(1)
    top5 = np.argsort(-logits, 1)[:, :5]
    acc = float((pred == y).mean())
    result["fp32"] = {
        "onnx": ONNX_PATH.relative_to(PROJECT_ROOT).as_posix(),
        "top1_accuracy": acc,
        "top5_accuracy": float((top5 == y[:, None]).any(1).mean()),
        "abs_diff_vs_reported": abs(acc - reported_acc),
        "matches_reported": abs(acc - reported_acc) <= TOLERANCE,
        "eval_seconds": round(time.time() - t, 1),
    }
    print(json.dumps(result["fp32"], indent=2))

    for name, path in (("int8", ONNX_INT8_PATH), ("fp16", ONNX_FP16_PATH)):
        if not path.exists():
            continue
        t = time.time()
        q = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
        ql = run(q, paths)
        qp = ql.argmax(1)
        agree = float((qp == pred).mean())
        p32 = np.exp(logits - logits.max(1, keepdims=True))
        p32 /= p32.sum(1, keepdims=True)
        pq = np.exp(ql - ql.max(1, keepdims=True))
        pq /= pq.sum(1, keepdims=True)
        result[name] = {
            "onnx": path.relative_to(PROJECT_ROOT).as_posix(),
            "size_mb": round(path.stat().st_size / 1e6, 1),
            "top1_accuracy": float((qp == y).mean()),
            "top5_accuracy": float((np.argsort(-ql, 1)[:, :5] == y[:, None]).any(1).mean()),
            "top1_agreement_with_fp32": agree,
            "top5_set_agreement_with_fp32": float(np.mean([
                set(a) == set(b) for a, b in zip(np.argsort(-ql, 1)[:, :5], top5)])),
            "max_abs_prob_diff_vs_fp32": float(np.abs(pq - p32).max()),
            "agreement_threshold": AGREEMENT_THRESHOLD,
            "usable": agree >= AGREEMENT_THRESHOLD,
            "eval_seconds": round(time.time() - t, 1),
        }
        print(name, json.dumps(result[name], indent=2))

    if args.limit:
        print("--limit given: not writing eval file / registry")
        return
    EVAL_PATH.write_text(json.dumps(result, indent=2) + "\n")
    print(f"wrote {EVAL_PATH.relative_to(PROJECT_ROOT)}")

    if REGISTRY_PATH.exists():
        reg = json.loads(REGISTRY_PATH.read_text())
        for m in reg["models"]:
            if m["id"] != "efficientnetv2_s":
                continue
            for name in ("int8", "fp16"):
                if name in result and name in m.get("variants", {}):
                    m["variants"][name]["usable"] = result[name]["usable"]
                    m["variants"][name]["top1_agreement_with_fp32"] = result[name]["top1_agreement_with_fp32"]
        REGISTRY_PATH.write_text(json.dumps(reg, indent=2) + "\n")
        print(f"updated {REGISTRY_PATH.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
