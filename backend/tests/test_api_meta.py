"""Endpoints that do not need the ONNX model: health, models, metrics, figures."""
from __future__ import annotations

from app.services.metrics import SUMMARY_KEYS


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] in ("ok", "degraded")
    assert j["default_model"] == "efficientnetv2_s"
    assert j["version"]
    assert [m["id"] for m in j["models"]] == ["efficientnetv2_s"]


def test_models(client):
    j = client.get("/api/models").json()
    assert j["default"] == "efficientnetv2_s"
    (m,) = j["models"]
    assert m["id"] == "efficientnetv2_s" and m["display_name"] == "EfficientNetV2-S"
    assert m["num_classes"] == 80 and m["input_size"] == [224, 224]
    assert m["variant"] == "fp32"  # int8 is marked usable: false
    assert abs(m["test_metrics"]["test_accuracy"] - 0.8321) < 1e-3
    assert abs(m["test_metrics"]["test_top5_accuracy"] - 0.9847) < 1e-3

def test_metrics_shape(client):
    r = client.get("/api/metrics")
    assert r.status_code == 200
    models = r.json()["models"]
    assert set(models) == {"resnet50", "convnext_tiny", "efficientnetv2_s", "swin_tiny"}
    expected_summary = set(SUMMARY_KEYS) | {"train_time_minutes"}
    for mid, m in models.items():
        assert m["id"] == mid
        assert set(m["summary"]) == expected_summary
        assert 0.7 < m["summary"]["test_accuracy"] < 0.9
        assert m["summary"]["epochs"] == 12
        # every model has curves, from CSV or from embedded JSON history
        h = m["history"]
        for col in ("epoch", "train_loss", "train_acc", "val_loss", "val_acc"):
            assert col in h, (mid, col)
        assert len(h["epoch"]) == len(h["val_acc"]) > 0
        assert m["sources"] and m["figures"]
        assert all(f.startswith(mid + "_") for f in m["figures"])
    assert len(models["resnet50"]["per_class_accuracy"]) == 80
    assert len(models["convnext_tiny"]["per_class_prf"]) == 80
    assert models["efficientnetv2_s"]["summary"]["macro_f1"] == 0.769
    assert models["resnet50"]["summary"]["macro_roc_auc"] == 0.992872


def test_metrics_strip_local_paths(client):
    text = client.get("/api/metrics").text
    home = "/" + "Users/"  # split so `git grep` for personal paths stays clean
    assert home not in text and "\\\\Users" not in text
    figs = client.get("/api/metrics").json()["models"]["resnet50"]["raw"]["resnet50_evaluation.json"]["figures"]
    assert figs["roc_auc"] == "resnet50_roc_auc.png"


def test_figures_list_and_get(client):
    figs = client.get("/api/figures").json()["figures"]
    names = [f["name"] for f in figs]
    assert len(names) == 17 and "resnet50_confusion_matrix.png" in names
    r = client.get("/api/figures/resnet50_confusion_matrix.png")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_figures_rejects_traversal_and_unknown(client):
    for bad in (
        "../results/resnet50_results.json",
        "..%2Fresults%2Fresnet50_results.json",
        "%2e%2e%2f%2e%2e%2fREADME.md",
        "..%5C..%5CREADME.md",
        "resnet50_results.json",
        ".hidden.png",
        "nope.png",
        "resnet50_confusion_matrix.PNG",
        "resnet50_confusion_matrix.png%00.txt",
    ):
        r = client.get(f"/api/figures/{bad}")
        assert r.status_code in (400, 404), (bad, r.status_code)
        assert not r.content.startswith(b"\x89PNG"), bad


def test_openapi_and_docs(client):
    spec = client.get("/openapi.json").json()
    assert spec["info"]["title"] == "WildLens API"
    for path in ("/api/health", "/api/models", "/api/predict", "/api/explain", "/api/metrics",
                 "/api/figures", "/api/figures/{name}"):
        assert path in spec["paths"], path
    assert client.get("/docs").status_code == 200


def test_cors_allows_vite_dev_origin(client):
    r = client.options(
        "/api/predict",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    r = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers
