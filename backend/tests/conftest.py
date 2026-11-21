from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import List

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import REPO_ROOT, Settings
from app.main import create_app
from app.services.registry import load_registry

# Served ONNX file of the default model (honours WILDLENS_REGISTRY_PATH).
_REGISTRY = load_registry(Settings())
ONNX_PATH = _REGISTRY.get(_REGISTRY.default).onnx_path
MANIFEST = REPO_ROOT / "data" / "manifest.csv"

requires_model = pytest.mark.skipif(
    not ONNX_PATH.is_file(),
    reason=f"{ONNX_PATH.name} missing (gitignored): generate it with scripts/export_onnx.py "
    "(see scripts/download_models.sh)",
)


def _test_images(n: int = 3) -> List[Path]:
    """A few test-split images from data/manifest.csv (Windows paths -> POSIX)."""
    if not MANIFEST.is_file():
        return []
    out = []
    with MANIFEST.open(newline="") as fh:
        for row in csv.DictReader(fh):
            if row["split"] != "test":
                continue
            p = REPO_ROOT / row["filepath"].replace("\\", "/")
            if p.is_file():
                out.append((row["label"], p))
            if len(out) >= 200:
                break
    # spread over different labels, deterministic
    seen, picked = set(), []
    for label, p in out:
        if label not in seen:
            seen.add(label)
            picked.append(p)
        if len(picked) >= n:
            break
    return picked


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(max_upload_mb=10)


@pytest.fixture(scope="session")
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture(scope="session")
def test_image_paths() -> List[Path]:
    paths = _test_images(3)
    if not paths:
        pytest.skip("no test images under data/processed (local-only dataset, not in git)")
    return paths


@pytest.fixture(scope="session")
def test_image_path(test_image_paths) -> Path:
    return test_image_paths[0]


def make_image_bytes(size=(320, 240), fmt="JPEG", color=(120, 160, 90), exif=None) -> bytes:
    img = Image.new("RGB", size, color)
    # add some structure so the model sees more than a flat colour
    for x in range(0, size[0], 16):
        for y in range(size[1]):
            img.putpixel((x, y), (20, 20, 20))
    buf = io.BytesIO()
    kwargs = {"exif": exif} if exif is not None else {}
    img.save(buf, format=fmt, **kwargs)
    return buf.getvalue()
