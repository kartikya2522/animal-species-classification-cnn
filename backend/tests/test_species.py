"""Species knowledge base: data integrity + /api/species endpoints (no network)."""
from __future__ import annotations

import json

import pytest

from app.config import REPO_ROOT
from app.services.knowledge import SpeciesKB

KB_PATH = REPO_ROOT / "data" / "species_kb.json"
CLASSES = json.loads((REPO_ROOT / "models" / "classes.json").read_text())
IUCN_CODES = {"LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD", "NE"}
GROUPS = {"Mammal", "Bird", "Reptile", "Amphibian", "Fish", "Insect", "Arachnid", "Crustacean", "Mollusc", "Other"}

pytestmark = pytest.mark.skipif(not KB_PATH.is_file(), reason="data/species_kb.json not built")


@pytest.fixture(scope="module")
def kb_entries():
    return json.loads(KB_PATH.read_text())["species"]


# ---------------------------------------------------------------- KB integrity
def test_kb_has_80_entries_in_class_order(kb_entries):
    assert len(kb_entries) == 80
    assert [e["label"] for e in kb_entries] == CLASSES


def test_kb_slugs_unique_and_urlsafe(kb_entries):
    slugs = [e["slug"] for e in kb_entries]
    assert len(set(slugs)) == 80
    for s in slugs:
        assert s and all(c.isalnum() or c == "-" for c in s) and s == s.lower()


def test_kb_groups_never_carry_species_status(kb_entries):
    for e in kb_entries:
        st = e["iucn_status"]
        if e["is_group"] or e.get("domestic") or e["rank"] == "hybrid":
            assert st["code"] is None, e["label"]
            assert st["label"].startswith("Not applicable"), e["label"]
        else:
            assert st["code"] in IUCN_CODES, (e["label"], st)
            assert st["source"], e["label"]


def test_kb_required_fields(kb_entries):
    for e in kb_entries:
        assert e["summary"] and len(e["summary"]) > 50, e["label"]
        assert e["wikipedia_url"].startswith("https://en.wikipedia.org/"), e["label"]
        assert e["scientific_name"], e["label"]
        img = e["image"]
        assert img and img["url"].startswith("https://") and img["license"], e["label"]
        assert img["source_url"], e["label"]
        assert e["animal_group"] in GROUPS, e["label"]
        assert e["model_stats"]["test_accuracy"] is not None, e["label"]
        assert e["inaturalist_taxon_id"], e["label"]
        assert e["rank_note"], e["label"]


def test_kb_known_entries(kb_entries):
    by = {e["label"]: e for e in kb_entries}
    assert by["Fish"]["is_group"] and by["Turtle"]["is_group"] and by["Moths and butterflies"]["is_group"]
    assert by["Red panda"]["scientific_name"] == "Ailurus fulgens" and by["Red panda"]["iucn_status"]["code"] == "EN"
    assert by["Polar bear"]["iucn_status"]["code"] == "VU"
    assert by["Penguin"]["animal_group"] == "Bird" and by["Spider"]["animal_group"] == "Arachnid"
    assert by["Shark"]["animal_group"] == "Fish" and by["Crab"]["animal_group"] == "Crustacean"


def test_kb_name_matching():
    kb = SpeciesKB.load(KB_PATH)
    names = lambda t: [e["label"] for e in kb.match_text(t)]  # noqa: E731
    assert names("Where do red pandas live?") == ["Red panda"]
    assert names("polar bears vs brown bears") == ["Polar bear", "Brown bear"]
    assert names("How big is a giant panda?") == ["Panda"]
    assert names("Tell me about mice") == ["Mouse"]
    assert names("what is the capital of France") == []
    assert kb.resolve("Red panda")["slug"] == "red-panda" and kb.resolve("red-panda")["label"] == "Red panda"


# ---------------------------------------------------------------- API
def test_species_list(client):
    r = client.get("/api/species")
    assert r.status_code == 200
    j = r.json()
    assert j["count"] == j["total"] == 80
    assert [s["label"] for s in j["species"]] == CLASSES
    s = j["species"][0]
    assert set(s) == {"slug", "label", "common_name", "scientific_name", "is_group", "animal_group", "thumb_url",
                      "iucn_code", "iucn_label", "model_accuracy"}


def test_species_search_and_filters(client):
    j = client.get("/api/species", params={"q": "panda"}).json()
    assert {s["label"] for s in j["species"]} == {"Panda", "Red panda"} and j["total"] == 80
    j = client.get("/api/species", params={"q": "ailurus"}).json()
    assert [s["label"] for s in j["species"]] == ["Red panda"]
    birds = client.get("/api/species", params={"group": "bird"}).json()["species"]
    assert birds and all(s["animal_group"] == "Bird" for s in birds)
    assert "Penguin" in {s["label"] for s in birds}
    en = client.get("/api/species", params={"status": "en"}).json()["species"]
    assert en and all(s["iucn_code"] == "EN" for s in en)
    na = client.get("/api/species", params={"status": "NA"}).json()["species"]
    assert na and all(s["iucn_code"] is None for s in na)
    combo = client.get("/api/species", params={"group": "Mammal", "status": "VU"}).json()["species"]
    assert "Polar bear" in {s["label"] for s in combo}
    assert client.get("/api/species", params={"q": "zzzz"}).json()["count"] == 0


def test_species_detail_and_404(client):
    r = client.get("/api/species/red-panda")
    assert r.status_code == 200
    j = r.json()
    assert j["label"] == "Red panda" and j["iucn_status"]["code"] == "EN"
    assert j["image"]["license"] and j["gbif_taxon_key"] and j["inaturalist_taxon_id"]
    assert j["model_stats"]["model"] == "efficientnetv2_s"
    for bad in ("nope", "Red%20panda", "..%2Fspecies_kb.json"):
        r = client.get(f"/api/species/{bad}")
        assert r.status_code == 404, bad
    assert client.get("/api/species/nope").json() == {"detail": "Unknown species 'nope'."}


def test_openapi_lists_new_routes(client):
    paths = client.get("/openapi.json").json()["paths"]
    for p in ("/api/species", "/api/species/{slug}", "/api/chat"):
        assert p in paths


def test_predict_and_explain_include_slugs(client):
    from tests.conftest import ONNX_PATH, make_image_bytes

    if not ONNX_PATH.is_file():
        pytest.skip("ONNX model missing")
    img = make_image_bytes()
    for path in ("/api/predict", "/api/explain"):
        j = client.post(path, files={"file": ("a.jpg", img, "image/jpeg")}).json()
        labels = {p["label"] for p in j["predictions"]}
        assert labels <= set(j["slugs"]), path
        for label, slug in j["slugs"].items():
            assert client.get(f"/api/species/{slug}").json()["label"] == label


def _all_url_fields(obj, key=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _all_url_fields(v, k)
    elif isinstance(obj, list):
        for v in obj:
            yield from _all_url_fields(v, key)
    elif key.endswith("url") and obj is not None:
        yield key, obj


def test_kb_urls_are_all_http_or_https():
    """L2: every *url field in the committed KB is an absolute http(s) URL (links in the UI)."""
    import json
    import re

    from app.config import REPO_ROOT

    path = REPO_ROOT / "data" / "species_kb.json"
    if not path.is_file():
        pytest.skip("data/species_kb.json not built")
    urls = list(_all_url_fields(json.loads(path.read_text(encoding="utf-8"))))
    assert len(urls) > 300
    bad = [(k, u) for k, u in urls if not re.match(r"^https?://[^\s/]+", u)]
    assert bad == []


def test_build_script_drops_non_http_urls():
    import importlib.util

    from app.config import REPO_ROOT

    spec = importlib.util.spec_from_file_location("build_species_kb", REPO_ROOT / "scripts" / "build_species_kb.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    entry = {"wikipedia_url": "https://en.wikipedia.org/wiki/Koala",
             "image": {"license_url": "javascript:alert(1)", "source_url": "data:text/html,x",
                       "url": "//upload.wikimedia.org/x.jpg", "thumb_url": "http://ok.example/t.jpg", "artist": "javascript:"},
             "iucn_status": {"source_url": None}}
    out = mod.sanitize_urls(entry)
    assert out["wikipedia_url"] == "https://en.wikipedia.org/wiki/Koala"
    assert out["image"] == {"license_url": None, "source_url": None, "url": None,
                            "thumb_url": "http://ok.example/t.jpg", "artist": "javascript:"}
    assert out["iucn_status"] == {"source_url": None}
