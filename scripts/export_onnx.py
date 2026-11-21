"""
Phase 0: export the trained efficientnetv2_s to ONNX + portable side artifacts.

Outputs (in models/):
  efficientnetv2_s.onnx        FP32, inputs `input` (N,3,224,224); outputs
                       `logits` (N,80) and `features` (N,1280,7,7) from model.features
  efficientnetv2_s.int8.onnx   optional int8 dynamic-quantized variant (--quantize)
  efficientnetv2_s.fp16.onnx   optional FP16 variant (--fp16 / --fp16-only): weights and
                       activations in float16, inputs/outputs kept float32
  efficientnetv2_s_fc.npz      fc weight (80,1280) / bias (80,) float32 for CAM
  efficientnetv2_s_fc.json     same, as JSON (flat row-major arrays) for the browser
  classes.json         80 class names in training index order
  registry.json        model registry

Usage (from repo root):
    venv/bin/python scripts/export_onnx.py [--quantize] [--fp16]
    venv/bin/python scripts/export_onnx.py --fp16-only   # convert the existing FP32 file only
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_common import (  # noqa: E402
    CLASSES_PATH, EVAL_PATH, FC_JSON_PATH, FC_NPZ_PATH, MODELS_DIR, ONNX_FP16_PATH, ONNX_INT8_PATH,
    ONNX_PATH, PROJECT_ROOT, REGISTRY_PATH, build_torch_model, class_list,
)
from preprocessing import DEFAULT_MEAN, DEFAULT_SIZE, DEFAULT_STD  # noqa: E402

OPSET = 17


class EffNetWithFeatures(nn.Module):
    """Returns (logits, last feature map). Same math as torchvision's
    EfficientNet.forward: features -> avgpool -> flatten -> classifier."""

    def __init__(self, model: nn.Module):
        super().__init__()
        self.m = model

    def forward(self, x):
        feats = self.m.features(x)                      # (N, 1280, 7, 7)
        logits = self.m.classifier(torch.flatten(self.m.avgpool(feats), 1))
        return logits, feats


def rel(p: Path) -> str:
    return p.relative_to(PROJECT_ROOT).as_posix()


def export_fp32(model: nn.Module) -> None:
    wrapper = EffNetWithFeatures(model).eval()
    dummy = torch.randn(1, 3, DEFAULT_SIZE, DEFAULT_SIZE)
    torch.onnx.export(
        wrapper,
        dummy,
        str(ONNX_PATH),
        input_names=["input"],
        output_names=["logits", "features"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}, "features": {0: "batch"}},
        opset_version=OPSET,
        do_constant_folding=True,
        dynamo=False,
    )
    import onnx

    onnx.checker.check_model(onnx.load(str(ONNX_PATH)))
    print(f"wrote {rel(ONNX_PATH)} ({ONNX_PATH.stat().st_size / 1e6:.1f} MB)")


def export_int8() -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = MODELS_DIR / "efficientnetv2_s.pre.onnx"
    quant_pre_process(str(ONNX_PATH), str(pre), skip_symbolic_shape=True)
    quantize_dynamic(
        str(pre), str(ONNX_INT8_PATH), weight_type=QuantType.QUInt8, per_channel=False
    )
    pre.unlink(missing_ok=True)
    print(f"wrote {rel(ONNX_INT8_PATH)} ({ONNX_INT8_PATH.stat().st_size / 1e6:.1f} MB)")


def _toposort(graph) -> None:
    """Reorder graph.node topologically in place (stable for already-sorted nodes)."""
    available = {i.name for i in graph.input} | {i.name for i in graph.initializer} | {""}
    pending = list(graph.node)
    ordered = []
    while pending:
        rest = []
        for n in pending:
            if all(i in available for i in n.input):
                ordered.append(n)
                available.update(n.output)
            else:
                rest.append(n)
        if len(rest) == len(pending):
            raise RuntimeError("graph has a cycle or a missing input")
        pending = rest
    del graph.node[:]
    graph.node.extend(ordered)


def export_fp16() -> None:
    """FP32 ONNX -> FP16 weights/activations with float32 graph inputs/outputs.

    Uses onnxruntime's bundled float16 converter (no extra dependency). keep_io_types
    inserts Cast nodes at the graph boundary, so callers still feed/receive float32
    and the browser code does not change.
    """
    import onnx
    from onnxruntime.transformers.float16 import convert_float_to_float16

    model = onnx.load(str(ONNX_PATH))
    fp16 = convert_float_to_float16(model, keep_io_types=True, disable_shape_infer=False)
    _toposort(fp16.graph)  # the converter appends the boundary Cast nodes at the end
    onnx.checker.check_model(fp16)
    onnx.save(fp16, str(ONNX_FP16_PATH))
    print(f"wrote {rel(ONNX_FP16_PATH)} ({ONNX_FP16_PATH.stat().st_size / 1e6:.1f} MB)")


def write_fc(model: nn.Module) -> None:
    w = model.classifier[1].weight.detach().cpu().numpy().astype(np.float32)
    b = model.classifier[1].bias.detach().cpu().numpy().astype(np.float32)
    assert w.shape == (80, 1280) and b.shape == (80,)
    np.savez(FC_NPZ_PATH, weight=w, bias=b)
    FC_JSON_PATH.write_text(json.dumps({
        "shape": list(w.shape),
        "layout": "row-major: weight[c*1280 + k] = W[c, k]",
        # float32 -> shortest repr that round-trips through float32
        "weight": [float(np.format_float_positional(v, unique=True)) for v in w.ravel()],
        "bias": [float(v) for v in b],
    }, separators=(",", ":")))
    print(f"wrote {rel(FC_NPZ_PATH)} ({FC_NPZ_PATH.stat().st_size / 1e6:.2f} MB), "
          f"{rel(FC_JSON_PATH)} ({FC_JSON_PATH.stat().st_size / 1e6:.2f} MB)")


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_registry(int8_usable: bool | None, fp16_eval: dict | None = None,
                   int8_agreement: float | None = None) -> None:
    variants = {"fp32": {"onnx": rel(ONNX_PATH), "usable": True}}
    if ONNX_FP16_PATH.exists():
        variants["fp16"] = {
            "onnx": rel(ONNX_FP16_PATH),
            "usable": bool((fp16_eval or {}).get("usable")),
            "note": "float16 weights/activations, float32 inputs/outputs (Cast at the boundary); usable only if "
                    "test-set top-1 agreement with fp32 >= 99% (see eval file)",
        }
        if fp16_eval and "top1_agreement_with_fp32" in fp16_eval:
            variants["fp16"]["top1_agreement_with_fp32"] = fp16_eval["top1_agreement_with_fp32"]
    if ONNX_INT8_PATH.exists():
        variants["int8"] = {
            "onnx": rel(ONNX_INT8_PATH),
            "usable": bool(int8_usable),
            "note": "int8 dynamic quantization (uint8 per-tensor weights; ConvInteger/MatMulInteger ops); usable only if "
                    "test-set top-1 agreement with fp32 >= 99% (see eval file)",
        }
        if int8_agreement is not None:
            variants["int8"]["top1_agreement_with_fp32"] = int8_agreement
    # Download metadata for scripts/download_models.sh: the SHA-256 of each exported file and a
    # download URL (empty until the files are hosted; kept from the current registry on re-export).
    old_variants = {}
    if REGISTRY_PATH.exists():
        for m in json.loads(REGISTRY_PATH.read_text()).get("models", []):
            if m.get("id") == "efficientnetv2_s":
                old_variants = m.get("variants") or {}
    for name, v in variants.items():
        v["download_url"] = (old_variants.get(name) or {}).get("download_url", "")
        v["sha256"] = file_sha256(PROJECT_ROOT / v["onnx"])
    registry = {
        "default": "efficientnetv2_s",
        "models": [{
            "id": "efficientnetv2_s",
            "display_name": "EfficientNetV2-S",
            "architecture": "torchvision efficientnet_v2_s, classifier = Dropout + Linear(1280, 80)",
            "onnx": rel(ONNX_PATH),
            "variants": variants,
            "inputs": {"name": "input", "layout": "NCHW", "dtype": "float32"},
            "outputs": {"logits": "N x 80", "features": "N x 1280 x 7 x 7 (features)"},
            "classes": rel(CLASSES_PATH),
            "num_classes": 80,
            "fc": {"npz": rel(FC_NPZ_PATH), "json": rel(FC_JSON_PATH)},
            "input_size": [DEFAULT_SIZE, DEFAULT_SIZE],
            "resize": "bilinear, direct to 224x224 (no crop, aspect not preserved)",
            "scale": "pixel / 255",
            "mean": list(DEFAULT_MEAN),
            "std": list(DEFAULT_STD),
            "metrics": {
                "results": "outputs/results/efficientnetv2_s_metrics.json",
                "evaluation": "outputs/results/efficientnetv2_s_evaluation.json",
                "onnx_eval": rel(EVAL_PATH),
            },
            "cam": {
                "layer": "features (last conv block, after the final 1x1 conv-BN-SiLU)",
                "method": "CAM == Grad-CAM for GAP->Linear head (dropout is identity at eval): "
                          "heatmap_c = ReLU(sum_k W_fc[c,k] * features[k]); "
                          "upsample 7x7 -> 224x224, normalize to [0,1]",
            },
        }],
    }
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2) + "\n")
    print(f"wrote {rel(REGISTRY_PATH)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quantize", action="store_true", help="also write int8 variant")
    ap.add_argument("--fp16", action="store_true", help="also write FP16 variant (float32 IO)")
    ap.add_argument("--fp16-only", action="store_true",
                    help="only convert the existing models/efficientnetv2_s.onnx to FP16 (no checkpoint needed)")
    args = ap.parse_args()

    MODELS_DIR.mkdir(exist_ok=True)
    if args.fp16_only:
        if not ONNX_PATH.exists():
            sys.exit(f"{rel(ONNX_PATH)} not found; run without --fp16-only first")
        export_fp16()
        refresh_registry_variants()
        return
    model, _ = build_torch_model()
    print("loaded efficientnetv2_s state_dict (strict=True)")

    classes = class_list("test")
    assert classes == class_list("train") == class_list("val") and len(classes) == 80
    CLASSES_PATH.write_text(json.dumps(classes, indent=2) + "\n")
    print(f"wrote {rel(CLASSES_PATH)} ({len(classes)} classes)")

    export_fp32(model)
    write_fc(model)
    if args.quantize:
        export_int8()
    if args.fp16:
        export_fp16()
    refresh_registry_variants()


def refresh_registry_variants() -> None:
    # Variant usability is decided by scripts/evaluate_onnx.py, which rewrites the registry.
    ev = json.loads(EVAL_PATH.read_text()) if EVAL_PATH.exists() else {}
    write_registry(ev.get("int8", {}).get("usable"), ev.get("fp16"),
                   ev.get("int8", {}).get("top1_agreement_with_fp32"))


if __name__ == "__main__":
    main()
