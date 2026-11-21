"""GET /api/species and GET /api/species/{slug} (pre-built knowledge base)."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import Settings
from app.deps import get_kb, get_settings
from app.schemas import (
    ErrorResponse, SpeciesDetail, SpeciesImageFiles, SpeciesImagesResponse, SpeciesListResponse, SpeciesSummary,
)
from app.services.knowledge import SpeciesKB

router = APIRouter(tags=["species"])


@router.get(
    "/species",
    response_model=SpeciesListResponse,
    response_model_exclude_unset=True,
    summary="List the 80 species/classes",
    description="Atlas listing in class order. `q` searches common/scientific names and taxonomy "
    "(case-insensitive substring); `group` filters by animal group (Mammal, Bird, Reptile, Amphibian, Fish, "
    "Insect, Arachnid, Crustacean, Mollusc, Other); `status` by IUCN code (LC, NT, VU, EN, CR, EW, EX, DD, NE) "
    "or `NA` for entries without a species-level status (groups, domestic forms, hybrid). "
    "`extended=true` adds `rank`, `image` (with attribution), `inaturalist_observations` and `test_images` "
    "to each row (used by the Species Atlas).",
)
def list_species(
    q: Optional[str] = Query(None, max_length=100, description="Search text."),
    group: Optional[str] = Query(None, max_length=32, description="Animal group, e.g. `Mammal`."),
    status: Optional[str] = Query(None, max_length=8, description="IUCN code or `NA`."),
    extended: bool = Query(False, description="Include rank, image attribution, observations, test images."),
    kb: SpeciesKB = Depends(get_kb),
) -> SpeciesListResponse:
    def extra(e: dict) -> dict:
        if not extended:
            return {}
        return {
            "rank": e.get("rank"),
            "image": e.get("image"),
            "inaturalist_observations": e.get("inaturalist_observations"),
            "test_images": (e.get("model_stats") or {}).get("test_images"),
        }

    rows = [
        SpeciesSummary(
            slug=e["slug"],
            label=e["label"],
            common_name=e.get("common_name") or e["label"],
            scientific_name=e.get("scientific_name"),
            is_group=bool(e.get("is_group")),
            animal_group=e.get("animal_group"),
            thumb_url=(e.get("image") or {}).get("thumb_url"),
            iucn_code=(e.get("iucn_status") or {}).get("code"),
            iucn_label=(e.get("iucn_status") or {}).get("label"),
            model_accuracy=(e.get("model_stats") or {}).get("test_accuracy"),
            **extra(e),
        )
        for e in kb.search(q=q, group=group, status=status)
    ]
    return SpeciesListResponse(count=len(rows), total=len(kb), species=rows)


@router.get(
    "/species/{slug}",
    response_model=SpeciesDetail,
    responses={404: {"model": ErrorResponse}},
    summary="Full knowledge-base entry for one species/class",
)
def get_species(slug: str, kb: SpeciesKB = Depends(get_kb)) -> SpeciesDetail:
    e = kb.get(slug)
    if e is None:
        raise HTTPException(status_code=404, detail=f"Unknown species {slug!r}.")
    return SpeciesDetail(**e)


# ---------------------------------------------------------------- offline photo cache (Phase 4)
IMAGE_NAME_RE = re.compile(r"^[a-z0-9-]+-(hero|card)\.(jpg|png|webp|gif)$")
IMAGE_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}


def _cached_images(d: Path) -> Dict[str, Dict[str, str]]:
    """slug -> {kind: file name} for files listed in manifest.json that exist on disk."""
    try:
        listed = json.loads((d / "manifest.json").read_text(encoding="utf-8")).get("images") or {}
    except (OSError, ValueError):
        return {}
    present = {p.name for p in d.iterdir() if p.is_file()} if d.is_dir() else set()
    out: Dict[str, Dict[str, str]] = {}
    for slug, files in listed.items():
        ok = {k: n for k, n in (files or {}).items() if isinstance(n, str) and IMAGE_NAME_RE.match(n) and n in present}
        if ok:
            out[slug] = ok
    return out


@router.get(
    "/species-images",
    response_model=SpeciesImagesResponse,
    summary="Locally cached species photos",
    description="Slug -> URLs of local copies of the knowledge-base photos (hero ~1280 px, card ~500 px), "
    "written by `scripts/cache_species_images.py`. Empty when the cache has not been built; clients then "
    "fall back to the Wikimedia Commons URLs. Attribution is in `/api/species/{slug}`.",
)
def species_images(settings: Settings = Depends(get_settings)) -> SpeciesImagesResponse:
    cached = _cached_images(settings.resolve(settings.species_images_dir))
    images = {
        slug: SpeciesImageFiles(**{k: f"/api/species-images/{n}" for k, n in files.items()})
        for slug, files in cached.items()
    }
    return SpeciesImagesResponse(count=len(images), images=images)


@router.get(
    "/species-images/{name}",
    summary="One cached species photo",
    response_class=FileResponse,
    responses={200: {"content": {"image/jpeg": {}, "image/png": {}}}, 404: {"model": ErrorResponse}},
)
def species_image(name: str, settings: Settings = Depends(get_settings)) -> FileResponse:
    d = settings.resolve(settings.species_images_dir)
    # Same rule as /api/figures: only well-formed names that are listed in the manifest and exist.
    listed = {n for files in _cached_images(d).values() for n in files.values()}
    if not IMAGE_NAME_RE.match(name) or name not in listed:
        raise HTTPException(status_code=404, detail=f"Image {name!r} not found.")
    return FileResponse(
        d / name,
        media_type=IMAGE_TYPES[name.rsplit(".", 1)[-1]],
        headers={"Cache-Control": "public, max-age=86400"},
    )
