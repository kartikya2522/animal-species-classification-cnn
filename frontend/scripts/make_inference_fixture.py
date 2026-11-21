"""Generate src/lib/inference/__fixtures__/backend.json from the backend's own code.

Vitest compares the TypeScript preprocessing / softmax / top-k / CAM against these
outputs, so the browser path is checked against the exact server implementation.

Run from the repo root:  backend/.venv/bin/python frontend/scripts/make_inference_fixture.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.services import cam  # noqa: E402
from app.services.inference import softmax  # noqa: E402
from app.services.preprocessing import DEFAULT_MEAN, DEFAULT_STD, preprocess_image  # noqa: E402

OUT = ROOT / "frontend" / "src" / "lib" / "inference" / "__fixtures__" / "backend.json"
rng = np.random.default_rng(42)


def resize_case(sw, sh, dw, dh):
    # smooth-ish random image (gradients + noise) so rounding paths are exercised
    x = rng.integers(0, 256, size=(sh, sw, 3), dtype=np.uint8)
    out = np.asarray(Image.fromarray(x).resize((dw, dh), Image.BILINEAR))
    return {"sw": sw, "sh": sh, "dw": dw, "dh": dh, "src": x.ravel().tolist(), "out": out.ravel().tolist()}


resize = [resize_case(64, 48, 20, 20), resize_case(9, 7, 20, 20), resize_case(300, 10, 13, 13),
          resize_case(31, 57, 17, 11)]

img = rng.integers(0, 256, size=(30, 40, 3), dtype=np.uint8)
pre = preprocess_image(Image.fromarray(img), size=8)  # (3, 8, 8)
preprocess = {"sw": 40, "sh": 30, "size": 8, "src": img.ravel().tolist(),
              "mean": list(DEFAULT_MEAN), "std": list(DEFAULT_STD), "out": [float(v) for v in pre.ravel()]}

logits = (rng.standard_normal(80) * 3).astype(np.float32)
probs = softmax(logits)
idx = np.argsort(-probs, kind="stable")[:5]
soft = {"logits": [float(v) for v in logits], "probs": [float(v) for v in probs], "top5": [int(i) for i in idx]}

K, C = 6, 3
feats = np.maximum(rng.standard_normal((K, 7, 7)), 0).astype(np.float32)
w = rng.standard_normal((C, K)).astype(np.float32)
grid = cam.normalize(cam.compute_cam(feats, w, 1))
size = cam.fit_within((1600, 1200), 32)  # -> (32, 24)
heat = cam.normalize(cam.upsample(grid, size))
cam_case = {"K": K, "C": C, "class_index": 1, "features": [float(v) for v in feats.ravel()],
            "weight": [float(v) for v in w.ravel()], "grid": [float(v) for v in grid.ravel()],
            "image_size": [1600, 1200], "max_side": 32, "size": list(size),
            "heat": [float(v) for v in heat.ravel()],
            "heat_u8": np.clip(np.rint(heat * 255.0), 0, 255).astype(np.uint8).ravel().tolist()}

OUT.write_text(json.dumps({"generated_by": "frontend/scripts/make_inference_fixture.py", "resize": resize,
                           "preprocess": preprocess, "softmax": soft, "cam": cam_case}, separators=(",", ":")))
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
