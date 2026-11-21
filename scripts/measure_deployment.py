"""Measures low-confidence stats and the PyTorch-vs-ONNX max logit diff for the served model."""
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_common import ONNX_PATH, build_torch_model, load_classes, load_split  # noqa: E402
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
p = z / z.sum(1, keepdims=True)
correct = logits.argmax(1) == y
flag = p.max(1) < 0.5
print("n", len(y))
print("flagged", round(float(flag.mean()), 3))
print("accuracyWhenFlagged", round(float(correct[flag].mean()), 3))
print("accuracyOtherwise", round(float(correct[~flag].mean()), 3))
print("errorsFlagged", round(float((flag & ~correct).sum() / (~correct).sum()), 3))

sample = df.sample(n=50, random_state=0)["filepath"].tolist()
x = preprocess_batch([load_image(q) for q in sample])
model = build_torch_model()[0]
with torch.no_grad():
    t = model(torch.from_numpy(x)).numpy()
o = sess.run(["logits"], {"input": x})[0]
print("maxLogitDiff", f"{np.abs(t - o).max():.2e}")