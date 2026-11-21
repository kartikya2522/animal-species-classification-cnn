"""Model-dependent tests: predictions match a direct Phase-0 ONNX run; explain PNGs."""
from __future__ import annotations

import base64
import io

import numpy as np
import pytest
from PIL import Image

from app.services import cam
from tests.conftest import ONNX_PATH, make_image_bytes, requires_model

pytestmark = requires_model


def _png(b64: str) -> Image.Image:
    raw = base64.b64decode(b64)
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"
    img = Image.open(io.BytesIO(raw))
    img.load()
    return img


@pytest.fixture(scope="module")
def phase0_session():
    import onnxruntime as ort

    return ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])


def _phase0_reference(session, path):
    """Exactly the Phase-0 pipeline: scripts/preprocessing.py (via shim) + raw ONNX + softmax."""
    import sys

    from app.config import REPO_ROOT

    sys.path.insert(0, str(REPO_ROOT / "scripts"))
    from preprocessing import load_image, preprocess_batch  # noqa: E402

    x = preprocess_batch([load_image(path)])
    logits, feats = session.run(["logits", "features"], {"input": x})
    z = logits[0].astype(np.float64)
    p = np.exp(z - z.max())
    return p / p.sum(), feats[0]


def test_health_reports_model_loaded(client):
    j = client.get("/api/health").json()
    assert j["status"] == "ok" and j["models"][0]["loaded"] is True


def test_predict_happy_path(client, test_image_path):
    with open(test_image_path, "rb") as fh:
        r = client.post("/api/predict", files={"file": (test_image_path.name, fh, "image/jpeg")})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["model"] == "efficientnetv2_s"
    assert len(j["predictions"]) == 5
    assert j["image"] == {"width": 224, "height": 224, "format": "JPEG"}
    assert j["inference_ms"] > 0
    assert j["low_confidence"] == (j["predictions"][0]["probability"] < j["low_confidence_threshold"])
    for p in j["predictions"]:
        assert set(p) == {"label", "index", "probability"}


def test_predict_matches_phase0_onnx(client, test_image_paths, phase0_session):
    classes = client.app.state.manager.registry.get("efficientnetv2_s").classes
    for path in test_image_paths:
        ref_probs, _ = _phase0_reference(phase0_session, path)
        with open(path, "rb") as fh:
            j = client.post("/api/predict", files={"file": (path.name, fh, "image/jpeg")}, data={"top_k": "10"}).json()
        ref_top = np.argsort(-ref_probs, kind="stable")[:10]
        assert [p["index"] for p in j["predictions"]] == ref_top.tolist()
        for p in j["predictions"]:
            assert p["label"] == classes[p["index"]]
            assert abs(p["probability"] - ref_probs[p["index"]]) < 1e-5


def test_predict_labels_test_images_correctly_mostly(client, test_image_paths):
    """Sanity: the dataset folder name equals the predicted label for most samples."""
    hits = 0
    for path in test_image_paths:
        with open(path, "rb") as fh:
            j = client.post("/api/predict", files={"file": (path.name, fh, "image/jpeg")}).json()
        hits += j["predictions"][0]["label"] == path.parent.name
    assert hits >= len(test_image_paths) - 1


def test_explain_returns_pngs_of_image_size(client, test_image_path, phase0_session):
    with open(test_image_path, "rb") as fh:
        r = client.post("/api/explain", files={"file": (test_image_path.name, fh, "image/jpeg")})
    assert r.status_code == 200, r.text
    j = r.json()
    assert (j["width"], j["height"]) == (224, 224)
    ov, hm = _png(j["overlay_png"]), _png(j["heatmap_png"])
    assert ov.size == hm.size == (224, 224)
    assert ov.mode == "RGB" and hm.mode == "L"
    hm_arr = np.asarray(hm)
    assert hm_arr.max() == 255 and hm_arr.min() == 0
    # defaults to the top-1 class; label consistent with predictions
    assert j["class_index"] == j["predicted"]["index"] == j["predictions"][0]["index"]
    assert j["label"] == j["predicted"]["label"]
    # carries everything the frontend needs from a single call (no separate /api/predict)
    assert len(j["predictions"]) == 5 and j["inference_ms"] > 0
    assert j["low_confidence"] == (j["predictions"][0]["probability"] < j["low_confidence_threshold"])
    # grid equals the Phase-0 CAM formula on the reference features
    _, feats = _phase0_reference(phase0_session, test_image_path)
    fc = np.load(client.app.state.manager.registry.get("efficientnetv2_s").fc_npz_path)
    ref = cam.normalize(np.maximum(np.tensordot(fc["weight"][j["class_index"]], feats, axes=1), 0))
    assert np.allclose(np.asarray(j["grid"]), ref, atol=1e-3)


def test_explain_explicit_class_and_amber(client, test_image_path):
    with open(test_image_path, "rb") as fh:
        j = client.post(
            "/api/explain",
            files={"file": (test_image_path.name, fh, "image/jpeg")},
            data={"class_index": "79", "colormap": "amber"},
        ).json()
    assert j["class_index"] == 79 and j["label"] == "Zebra" and j["colormap"] == "amber"
    assert 0.0 <= j["probability"] <= 1.0
    assert len(j["grid"]) == 7 and len(j["grid"][0]) == 7


def test_explain_large_image_is_capped_and_keeps_aspect(client, settings):
    data = make_image_bytes((2000, 1000))
    j = client.post("/api/explain", files={"file": ("big.jpg", data, "image/jpeg")}).json()
    assert j["image"] == {"width": 2000, "height": 1000, "format": "JPEG"}
    assert (j["width"], j["height"]) == (settings.explain_max_side, settings.explain_max_side // 2)
    assert _png(j["overlay_png"]).size == _png(j["heatmap_png"]).size == (j["width"], j["height"])


def test_predict_exif_rotated_size(client):
    exif = Image.Exif()
    exif[0x0112] = 6
    data = make_image_bytes((320, 240), exif=exif.tobytes())
    j = client.post("/api/predict", files={"file": ("r.jpg", data, "image/jpeg")}).json()
    assert (j["image"]["width"], j["image"]["height"]) == (240, 320)


@pytest.mark.parametrize("fmt", ["PNG", "WEBP"])
def test_predict_png_and_webp(client, fmt):
    r = client.post("/api/predict", files={"file": ("a", make_image_bytes(fmt=fmt), "application/octet-stream")})
    assert r.status_code == 200 and r.json()["image"]["format"] == fmt


def test_explicit_default_model(client):
    r = client.post("/api/predict", files={"file": ("a.jpg", make_image_bytes(), "image/jpeg")}, data={"model": "efficientnetv2_s"})
    assert r.status_code == 200 and r.json()["model"] == "efficientnetv2_s"
