"""Upload validation. These run without the ONNX model (checks happen first)."""
from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services.images import ImageValidationError, decode_image
from tests.conftest import make_image_bytes, requires_model


def _post(client, data: bytes, name="x.jpg", ctype="image/jpeg", path="/api/predict", **form):
    return client.post(path, files={"file": (name, data, ctype)}, data=form)


@pytest.mark.parametrize("path", ["/api/predict", "/api/explain"])
def test_undecodable_file_is_422(client, path):
    r = _post(client, b"this is not an image" * 10, path=path)
    assert r.status_code == 422
    assert "decode" in r.json()["detail"].lower()


def test_lying_content_type_is_still_rejected(client):
    r = _post(client, b"%PDF-1.4 fake", name="a.png", ctype="image/png")
    assert r.status_code == 422


def test_truncated_jpeg_is_422(client):
    data = make_image_bytes((640, 480))
    r = _post(client, data[: len(data) // 2])
    assert r.status_code == 422
    assert "corrupt" in r.json()["detail"].lower() or "decode" in r.json()["detail"].lower()


def test_empty_file_is_422(client):
    r = _post(client, b"")
    assert r.status_code == 422


def test_unsupported_format_is_415(client):
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (1, 2, 3)).save(buf, format="GIF")
    r = _post(client, buf.getvalue(), name="a.gif", ctype="image/gif")
    assert r.status_code == 415


def test_missing_file_is_422(client):
    assert client.post("/api/predict", data={"top_k": "3"}).status_code == 422


@pytest.mark.parametrize("path", ["/api/predict", "/api/explain"])
def test_oversize_is_413(client, settings, path):
    big = b"\xff" * (settings.max_upload_bytes + 1024)
    r = _post(client, big, path=path)
    assert r.status_code == 413
    assert "10 MB" in r.json()["detail"]


def test_oversize_without_content_length_hits_handler_check(settings):
    """Handler re-checks the size even if the early Content-Length guard is bypassed."""
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app

    s = Settings(max_upload_mb=0.05)  # 51 KB, below the 64 KB multipart slack of the early guard
    with TestClient(create_app(s)) as c:
        r = c.post("/api/predict", files={"file": ("x.jpg", b"\x00" * 60_000, "image/jpeg")})
    assert r.status_code == 413


def test_unknown_model_is_404(client):
    r = _post(client, make_image_bytes(), model="vgg16")
    assert r.status_code == 404
    assert "vgg16" in r.json()["detail"]
    r = _post(client, make_image_bytes(), model="vgg16", path="/api/explain")
    assert r.status_code == 404


@pytest.mark.parametrize("k", ["0", "11", "-1", "abc"])
def test_top_k_out_of_bounds_is_422(client, k):
    r = _post(client, make_image_bytes(), top_k=k)
    assert r.status_code == 422


@requires_model
@pytest.mark.parametrize("k", [1, 5, 10])
def test_top_k_in_bounds(client, k):
    r = _post(client, make_image_bytes(), top_k=str(k))
    assert r.status_code == 200
    preds = r.json()["predictions"]
    assert len(preds) == k
    probs = [p["probability"] for p in preds]
    assert probs == sorted(probs, reverse=True)


@requires_model
def test_default_top_k_is_5(client):
    assert len(_post(client, make_image_bytes()).json()["predictions"]) == 5


def test_explain_bad_class_index_is_422(client):
    r = _post(client, make_image_bytes(), path="/api/explain", class_index="-1")
    assert r.status_code == 422
    r = _post(client, make_image_bytes(), path="/api/explain", colormap="viridis")
    assert r.status_code == 422


@requires_model
def test_explain_class_index_too_large_is_422(client):
    r = _post(client, make_image_bytes(), path="/api/explain", class_index="80")
    assert r.status_code == 422


# ---------------------------------------------------------------- decode_image unit tests
def test_decode_applies_exif_orientation():
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 CW on display
    data = make_image_bytes((320, 240), exif=exif.tobytes())
    img, fmt = decode_image(data, max_pixels=10_000_000)
    assert fmt == "JPEG" and img.mode == "RGB"
    assert img.size == (240, 320)


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_decode_accepts_allowed_formats(fmt):
    img, got = decode_image(make_image_bytes((50, 40), fmt=fmt), max_pixels=10_000_000)
    assert got == fmt and img.size == (50, 40) and img.mode == "RGB"


def test_decode_converts_rgba_and_grayscale_to_rgb():
    for mode in ("RGBA", "L", "P"):
        buf = io.BytesIO()
        Image.new("RGB", (30, 20), (10, 200, 30)).convert(mode).save(buf, format="PNG")
        img, _ = decode_image(buf.getvalue(), max_pixels=10_000_000)
        assert img.mode == "RGB"


def test_decode_pixel_limit():
    with pytest.raises(ImageValidationError) as e:
        decode_image(make_image_bytes((400, 300)), max_pixels=100_000)
    assert e.value.status_code == 422


def _chunked_multipart(payload: bytes, chunk: int = 256 * 1024):
    """Multipart body yielded in chunks, so httpx sends it without a Content-Length (chunked)."""
    boundary = "wildlensboundary"
    head = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.jpg\"\r\n"
            "Content-Type: image/jpeg\r\n\r\n").encode()
    body = head + payload + f"\r\n--{boundary}--\r\n".encode()

    def gen():
        for i in range(0, len(body), chunk):
            yield body[i:i + chunk]

    return gen(), {"content-type": f"multipart/form-data; boundary={boundary}"}


@pytest.mark.parametrize("path", ["/api/predict", "/api/explain"])
def test_oversize_chunked_upload_without_content_length_is_413(client, settings, path):
    content, headers = _chunked_multipart(b"\xff" * (settings.max_upload_bytes + 200 * 1024))
    r = client.post(path, content=content, headers=headers)
    assert "content-length" not in {k.lower() for k in r.request.headers}
    assert r.status_code == 413 and "10 MB" in r.json()["detail"]


def test_small_chunked_upload_without_content_length_reaches_handler(client):
    content, headers = _chunked_multipart(b"not an image")
    r = client.post("/api/predict", content=content, headers=headers)
    assert "content-length" not in {k.lower() for k in r.request.headers}
    assert r.status_code == 422  # decoded by the handler, not rejected by the size guard
