"""Per-class test evaluation of the served EfficientNetV2-S (fp32 ONNX).

Writes outputs/results/efficientnetv2_s_evaluation.json with test_top1_accuracy,
test_top5_accuracy, test_samples and per_class_accuracy (label -> recall).

Usage (repo root):  python scripts/evaluate_per_class.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_common import ONNX_PATH, PROJECT_ROOT, load_classes, load_split  # noqa: E402
from preprocessing import load_image, preprocess_batch  # noqa: E402

OUT = PROJECT_ROOT / "outputs" / "results" / "efficientnetv2_s_evaluation.json"


def main() -> None:
    classes = load_classes()
    idx = {c: i for i, c in enumerate(classes)}
    df = load_split("test")
    y = df["label"].map(idx).to_numpy()
    paths = df["filepath"].tolist()

    sess = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    out = []
    for i in range(0, len(paths), 64):
        x = preprocess_batch([load_image(p) for p in paths[i:i + 64]])
        out.append(sess.run(["logits"], {"input": x})[0])
        print(f"{min(i + 64, len(paths))}/{len(paths)}", end="\r", flush=True)
    logits = np.concatenate(out)

    pred = logits.argmax(1)
    top5 = np.argsort(-logits, 1)[:, :5]
    per_class = {c: round(float((pred[y == i] == i).mean()), 6)
                 for c, i in idx.items() if (y == i).any()}

    result = {
        "model": "efficientnetv2_s",
        "split": "test",
        "evaluated_with": "fp32 ONNX + scripts/preprocessing.py",
        "test_samples": int(len(y)),
        "test_top1_accuracy": float((pred == y).mean()),
        "test_top5_accuracy": float((top5 == y[:, None]).any(1).mean()),
        "per_class_accuracy": per_class,
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(f"\nwrote {OUT.relative_to(PROJECT_ROOT)}: top1={result['test_top1_accuracy']:.4f} "
          f"top5={result['test_top5_accuracy']:.4f} n={result['test_samples']}")


if __name__ == "__main__":
    main()