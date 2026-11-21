"""Phase 4 additions: /api/species?extended=true and the offline photo cache routes."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT, Settings
from app.main import create_app

KB_PATH = REPO_ROOT / "data" / "species_kb.json"
pytestmark = pytest.mark.skipif(not KB_PATH.is_file(), reason="data/species_kb.json not built")


def test_species_list_extended_adds_fields(client):
    plain = client.get("/api/species").json()["species"][0]
    assert "image" not in plain and "rank" not in plain  # default shape unchanged
    j = client.get("/api/species", params={"extended": "true"}).json()
    assert j["count"] == 80
    s = next(r for r in j["species"] if r["slug"] == "red-panda")
    assert s["rank"] == "species"
    assert s["image"]["license"] and s["image"]["source_url"]
    assert isinstance(s["inaturalist_observations"], int) and s["inaturalist_observations"] > 0
    assert isinstance(s["test_images"], int) and s["test_images"] > 0
    # filters still apply
    j = client.get("/api/species", params={"extended": "true", "status": "NA"}).json()
    assert j["species"] and all(r["iucn_code"] is None for r in j["species"])


@pytest.fixture()
def image_client(tmp_path):
    d = tmp_path / "species_images"
    d.mkdir()
    (d / "red-panda-hero.jpg").write_bytes(b"\xff\xd8\xff\xe0fakejpeg")
    (d / "red-panda-card.jpg").write_bytes(b"\xff\xd8\xff\xe0fakejpeg2")
    (d / "secret.txt").write_text("nope")
    (d / "manifest.json").write_text(json.dumps({"images": {
        "red-panda": {"hero": "red-panda-hero.jpg", "card": "red-panda-card.jpg"},
        "lion": {"hero": "lion-hero.jpg"},  # listed but missing on disk -> ignored
        "evil": {"hero": "../../etc/passwd"},  # malformed -> ignored
    }}))
    with TestClient(create_app(Settings(species_images_dir=d))) as c:
        yield c


def test_species_images_manifest(image_client):
    j = image_client.get("/api/species-images").json()
    assert j == {"count": 1, "images": {"red-panda": {
        "hero": "/api/species-images/red-panda-hero.jpg", "card": "/api/species-images/red-panda-card.jpg"}}}
    r = image_client.get("/api/species-images/red-panda-hero.jpg")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.content.startswith(b"\xff\xd8")


@pytest.mark.parametrize("name", ["secret.txt", "lion-hero.jpg", "manifest.json", "..%2Fmanifest.json"])
def test_species_images_rejects_unlisted(image_client, name):
    assert image_client.get(f"/api/species-images/{name}").status_code == 404


def test_species_images_missing_dir(tmp_path):
    with TestClient(create_app(Settings(species_images_dir=tmp_path / "absent"))) as c:
        assert c.get("/api/species-images").json() == {"count": 0, "images": {}}
        assert c.get("/api/species-images/red-panda-hero.jpg").status_code == 404
