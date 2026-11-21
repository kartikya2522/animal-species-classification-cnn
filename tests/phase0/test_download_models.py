"""scripts/download_models.sh: registry-driven download with SHA-256 verification (no network)."""
import hashlib
import json
import subprocess
from pathlib import Path
import sys

import pytest

needs_unix = pytest.mark.skipif(
    sys.platform == "win32",
    reason="runs a bash script that needs python3/curl on a Unix PATH",
)

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "download_models.sh"
REGISTRY = ROOT / "models" / "registry.json"


def _run(registry: Path, *args):
    return subprocess.run(["bash", str(SCRIPT), *args], capture_output=True, text=True,
                          env={"PATH": "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin", "WILDLENS_REGISTRY": str(registry)})


def _registry(tmp_path: Path, onnx: Path, url: str, sha: str) -> Path:
    reg = {"default": "m", "models": [{"id": "m", "variants": {"fp32": {"onnx": str(onnx), "download_url": url, "sha256": sha}}}]}
    p = tmp_path / "registry.json"
    p.write_text(json.dumps(reg))
    return p


def test_registry_has_download_fields_and_real_hashes():
    reg = json.loads(REGISTRY.read_text())
    for m in reg["models"]:
        for name, v in m["variants"].items():
            assert "download_url" in v and len(v["sha256"]) == 64, name
            f = ROOT / v["onnx"]
            if f.is_file():  # gitignored: only checked where the file exists
                assert hashlib.sha256(f.read_bytes()).hexdigest() == v["sha256"], name

@needs_unix
def test_missing_url_gives_clear_message(tmp_path):
    r = _run(_registry(tmp_path, tmp_path / "model.onnx", "", "0" * 64), "fp32")
    assert r.returncode == 2
    assert "no download URL is configured yet" in r.stderr and "export_onnx.py" in r.stderr
    assert not (tmp_path / "model.onnx").exists()

@needs_unix
def test_download_verifies_hash(tmp_path):
    src = tmp_path / "src.bin"
    src.write_bytes(b"fake onnx bytes")
    good = hashlib.sha256(src.read_bytes()).hexdigest()
    dest = tmp_path / "out" / "model.onnx"
    dest.parent.mkdir()

    bad = _run(_registry(tmp_path, dest, src.as_uri(), "f" * 64), "fp32")
    assert bad.returncode == 1 and "mismatch" in bad.stderr
    assert not dest.exists() and not Path(str(dest) + ".part").exists()

    ok = _run(_registry(tmp_path, dest, src.as_uri(), good), "fp32")
    assert ok.returncode == 0, ok.stderr
    assert dest.read_bytes() == b"fake onnx bytes"
    # second run: already present, verified, no download
    again = _run(_registry(tmp_path, dest, "", good), "fp32", "--check")
    assert again.returncode == 0 and "verified" in again.stdout

@needs_unix
@pytest.mark.skipif(not (ROOT / "models" / "efficientnetv2_s.onnx").is_file(), reason="models/efficientnetv2_s.onnx not present")
def test_check_local_models():
    r = subprocess.run(["bash", str(SCRIPT), "--check", "fp32"], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
