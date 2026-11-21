"""Low-confidence statistics at several thresholds for the served model (ONNX FP32, test split)."""
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_common import ONNX_PATH, load_classes, load_split  # noqa: E402
from preprocessing import load_image, preprocess_batch  # noqa: E402

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
logits = np.concatenate(out)
z = np.exp(logits - logits.max(1, keepdims=True))
conf = (z / z.sum(1, keepdims=True)).max(1)
correct = logits.argmax(1) == y

print(f"n={len(y)} overall top-1={correct.mean():.4f}")
print("| Threshold | Flagged | Top-1 acc. when flagged | Top-1 acc. when not flagged | Share of all errors flagged |")
print("|---|---|---|---|---|")
for t in (0.4, 0.5, 0.6, 0.7):
    flag = conf < t
    print(f"| {t} | {flag.mean()*100:.1f}% | {correct[flag].mean()*100:.1f}% | "
          f"{correct[~flag].mean()*100:.1f}% | {(flag & ~correct).sum() / (~correct).sum() * 100:.1f}% |")