import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from model_common import ONNX_PATH, load_split  # noqa: E402


@pytest.fixture(scope="session")
def test_df():
    return load_split("test")


@pytest.fixture(scope="session")
def sample_paths(test_df):
    """~50 test images spread across classes (deterministic)."""
    return test_df.sample(n=50, random_state=0)["filepath"].tolist()


@pytest.fixture(scope="session")
def torch_model():
    pytest.importorskip("torch")
    from model_common import build_torch_model
    return build_torch_model()[0]


@pytest.fixture(scope="session")
def ort_session():
    ort = pytest.importorskip("onnxruntime")
    if not ONNX_PATH.exists():
        pytest.skip("models/efficientnetv2_s.onnx missing; run scripts/export_onnx.py")
    return ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
