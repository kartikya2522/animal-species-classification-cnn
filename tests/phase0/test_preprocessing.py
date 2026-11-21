"""NumPy/PIL preprocessing must match the torchvision eval transform."""
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

torch = pytest.importorskip("torch")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from preprocessing import load_image, preprocess_image  # noqa: E402
from src.utils.transforms import get_eval_transform  # noqa: E402

TOL = 1e-6


def _check(img):
    ref = get_eval_transform()(img).numpy()
    ours = preprocess_image(img)
    assert ours.shape == ref.shape == (3, 224, 224)
    assert ours.dtype == np.float32
    assert np.abs(ours - ref).max() <= TOL


def test_module_has_no_torch_dependency():
    # Canonical module moved to the backend in Phase 1; scripts/preprocessing.py
    # is a re-export shim (checked below to expose the very same functions).
    import ast
    tree = ast.parse((ROOT / "backend" / "app" / "services" / "preprocessing.py").read_text())
    mods = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            mods |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            mods.add(node.module.split(".")[0])
    assert mods <= {"__future__", "typing", "numpy", "PIL"}, mods


def test_scripts_shim_reexports_backend_module():
    import preprocessing as shim
    from app.services import preprocessing as canonical

    assert shim.preprocess_image is canonical.preprocess_image
    assert shim.preprocess_batch is canonical.preprocess_batch
    assert shim.load_image is canonical.load_image


def test_matches_torchvision_on_test_images(sample_paths):
    for p in sample_paths[:20]:
        _check(load_image(p))


@pytest.mark.parametrize("size", [(640, 480), (300, 500), (113, 97), (224, 300), (1024, 768)])
def test_matches_torchvision_after_real_resize(sample_paths, size):
    # Dataset images are already 224x224 (resize is a no-op there), so exercise
    # the actual bilinear path with arbitrary upload-like sizes.
    for p in sample_paths[:5]:
        img = load_image(p).resize(size, Image.BICUBIC)
        _check(img)


def test_handles_rgba_and_grayscale(sample_paths):
    img = load_image(sample_paths[0]).resize((320, 240))
    for mode in ("RGBA", "L", "P"):
        conv = img.convert(mode)
        ref = get_eval_transform()(conv.convert("RGB")).numpy()
        assert np.abs(preprocess_image(conv) - ref).max() <= TOL
