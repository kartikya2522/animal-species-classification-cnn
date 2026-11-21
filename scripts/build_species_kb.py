#!/usr/bin/env python3
"""Build ``data/species_kb.json`` for the 80 class labels.

Usage (from the repo root, with the backend venv which already has httpx)::

    backend/.venv/bin/python scripts/build_species_kb.py            # uses the raw cache
    backend/.venv/bin/python scripts/build_species_kb.py --refresh  # refetch everything

Sources (all free, no key): Wikipedia REST summary + page image, Wikimedia Commons
``imageinfo`` (licence/attribution), Wikidata (P141 IUCN status, P225 taxon name),
iNaturalist ``/v1/taxa`` (taxon id, ancestry, observation count, conservation status,
fallback photo) and GBIF ``species/match`` (taxonKey for the occurrence map).

Each label is mapped to a Wikipedia article and a taxon by ``data/species_overrides.json``
(several labels are groups, domestic forms or a hybrid, not species).

IUCN status precedence (documented in backend/README.md):
1. Groups, domestic forms and hybrids -> ``code: null`` with an explicit "not applicable" label;
   a species-level status is never attached to them.
2. Wikidata P141 of the Wikipedia article's item, if that item's P225 equals the taxon.
3. iNaturalist's global IUCN Red List status of the taxon.
Disagreements between (2) and (3) are listed in the report.

Raw HTTP responses are cached under ``data/.kb_cache/`` (gitignored), so reruns do not
refetch; ``fetched_at`` is the time the raw responses were fetched, which keeps the
output byte-identical across reruns. Requests are sequential with a small delay and
retries with backoff. The User-Agent is generic and carries no personal data.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, unquote

import httpx

REPO = Path(__file__).resolve().parents[1]
CLASSES = REPO / "models" / "classes.json"
OVERRIDES = REPO / "data" / "species_overrides.json"
OUT = REPO / "data" / "species_kb.json"
CACHE = REPO / "data" / ".kb_cache"
EVALUATION = REPO / "outputs" / "results" / "efficientnetv2_s_evaluation.json"
MANIFEST = REPO / "data" / "manifest.csv"

USER_AGENT = "WildLens/0.1 (educational student project)"
WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_REST = "https://en.wikipedia.org/api/rest_v1/page/summary/"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
INAT = "https://api.inaturalist.org/v1"
GBIF = "https://api.gbif.org/v1"

# Seconds to wait after a non-cached request, per host (iNaturalist asks for <= 1 req/s).
DELAY = {"api.inaturalist.org": 1.0, "api.gbif.org": 0.2}
DEFAULT_DELAY = 0.5

IUCN_LABELS = {
    "LC": "Least Concern", "NT": "Near Threatened", "VU": "Vulnerable", "EN": "Endangered",
    "CR": "Critically Endangered", "EW": "Extinct in the Wild", "EX": "Extinct",
    "DD": "Data Deficient", "NE": "Not Evaluated",
}
# Wikidata items used as values of P141 (IUCN conservation status).
WIKIDATA_IUCN = {
    "Q211005": "LC", "Q719675": "NT", "Q278113": "VU", "Q11394": "EN", "Q219127": "CR",
    "Q239509": "EW", "Q237350": "EX", "Q3245245": "DD", "Q3350324": "NE",
    "Q96377276": "EN",  # newer "endangered" item used by some P141 statements
}
# iNaturalist conservation_status.iucn integer codes.
INAT_IUCN = {0: "NE", 5: "DD", 10: "LC", 20: "NT", 30: "VU", 40: "EN", 50: "CR", 60: "EW", 70: "EX"}
ANIMAL_ICONIC = {"Animalia", "Mammalia", "Aves", "Reptilia", "Amphibia", "Actinopterygii",
                 "Mollusca", "Arachnida", "Insecta"}


# ---------------------------------------------------------------- HTTP with cache
class Fetcher:
    def __init__(self, refresh: bool = False):
        self.refresh = refresh
        self.client = httpx.Client(headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                                   timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=True)
        self.network_calls = 0
        CACHE.mkdir(parents=True, exist_ok=True)

    def get(self, url: str, params: Optional[Dict[str, Any]] = None) -> Tuple[Optional[Any], float]:
        """Returns (json or None on 404, fetch timestamp)."""
        key_src = url + "?" + json.dumps(params or {}, sort_keys=True)
        path = CACHE / (hashlib.sha1(key_src.encode()).hexdigest() + ".json")
        if path.is_file() and not self.refresh:
            blob = json.loads(path.read_text(encoding="utf-8"))
            return blob["body"], blob["fetched_at"]
        last_exc: Optional[Exception] = None
        for attempt in range(5):
            wait = 3.0 * (2 ** attempt)
            try:
                r = self.client.get(url, params=params)
                self.network_calls += 1
                host = httpx.URL(url).host
                time.sleep(DELAY.get(host, DEFAULT_DELAY))
                if r.status_code == 404:
                    body = None
                elif r.status_code == 429 or r.status_code >= 500:
                    ra = r.headers.get("retry-after", "")
                    if ra.isdigit():
                        wait = max(wait, min(float(ra), 120.0))
                    raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
                else:
                    r.raise_for_status()
                    body = r.json()
                now = time.time()
                path.write_text(json.dumps({"url": key_src, "fetched_at": now, "body": body}), encoding="utf-8")
                return body, now
            except (httpx.HTTPError, ValueError) as exc:
                last_exc = exc
                print(f"    retry in {wait:.0f}s: {exc}", file=sys.stderr, flush=True)
                time.sleep(wait)
        raise RuntimeError(f"GET {url} failed after retries: {last_exc}")


# ---------------------------------------------------------------- helpers
def slugify(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def clean_url(u: Optional[str]) -> Optional[str]:
    """Drop Commons' utm_* tracking parameters."""
    return u.split("?utm_", 1)[0] if u else u


def http_url(u: Any) -> Optional[str]:
    """``u`` if it is an absolute http(s) URL, else None (no javascript:, data:, relative, ...)."""
    if not isinstance(u, str):
        return None
    u = u.strip()
    return u if re.match(r"(?i)^https?://[^\s/]+", u) else None


def sanitize_urls(obj: Any) -> Any:
    """Recursively null every ``*url`` field that is not an http(s) URL (licence/source links come
    from Commons extmetadata and other third-party data, rendered as links by the frontend)."""
    if isinstance(obj, dict):
        return {k: (http_url(v) if k.endswith("url") and v is not None else sanitize_urls(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_urls(v) for v in obj]
    return obj


def strip_html(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    # Commons "Artist" often carries boilerplate in <div>/<table> blocks (sponsor notes, templates).
    s = re.sub(r"<(div|table|style|script)\b[^>]*>.*?</\1>", " ", s, flags=re.S | re.I)
    s = re.sub(r"<br\s*/?>|</p>", "; ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s*;\s*(;\s*)*", "; ", s).strip(" ;")
    if len(s) > 200:
        s = s[:197].rsplit(" ", 1)[0] + "..."
    return s or None


def test_counts() -> Dict[str, int]:
    counts: Counter = Counter()
    if MANIFEST.is_file():
        with MANIFEST.open(newline="") as fh:
            for row in csv.DictReader(fh):
                if row.get("split") == "test":
                    counts[row["label"]] += 1
    return dict(counts)


def animal_group(names: List[str]) -> str:
    s = set(names)
    if "Mammalia" in s:
        return "Mammal"
    if "Aves" in s:
        return "Bird"
    if "Reptilia" in s or {"Testudines", "Squamata", "Crocodylia"} & s:
        return "Reptile"
    if "Amphibia" in s:
        return "Amphibian"
    if {"Actinopterygii", "Chondrichthyes", "Elasmobranchii", "Sarcopterygii"} & s:
        return "Fish"
    if "Insecta" in s:
        return "Insect"
    if "Arachnida" in s:
        return "Arachnid"
    if {"Crustacea", "Malacostraca"} & s:
        return "Crustacean"
    if "Mollusca" in s:
        return "Mollusc"
    return "Other"


# ---------------------------------------------------------------- sources
def wikipedia(f: Fetcher, title: str, stamps: List[float]) -> Dict[str, Any]:
    body, ts = f.get(WIKI_REST + quote(title.replace(" ", "_"), safe=""), {"redirect": "true"})
    stamps.append(ts)
    if not body:
        return {}
    return {
        "title": body.get("title"),
        "type": body.get("type"),
        "extract": body.get("extract"),
        "description": body.get("description"),
        "url": (body.get("content_urls") or {}).get("desktop", {}).get("page"),
        "wikibase_item": body.get("wikibase_item"),
        "original": (body.get("originalimage") or {}).get("source"),
    }


def page_image_name(f: Fetcher, title: str, stamps: List[float]) -> Optional[str]:
    body, ts = f.get(WIKI_API, {"action": "query", "prop": "pageimages", "piprop": "name",
                                "titles": title, "redirects": 1, "format": "json", "formatversion": 2})
    stamps.append(ts)
    pages = ((body or {}).get("query") or {}).get("pages") or []
    return pages[0].get("pageimage") if pages else None


def commons_image(f: Fetcher, name: str, stamps: List[float]) -> Optional[Dict[str, Any]]:
    body, ts = f.get(COMMONS_API, {"action": "query", "titles": "File:" + name, "prop": "imageinfo",
                                   "iiprop": "url|size|extmetadata", "iiurlwidth": 640,
                                   "format": "json", "formatversion": 2})
    stamps.append(ts)
    pages = ((body or {}).get("query") or {}).get("pages") or []
    if not pages or pages[0].get("missing") or not pages[0].get("imageinfo"):
        return None
    ii = pages[0]["imageinfo"][0]
    meta = ii.get("extmetadata") or {}

    def m(k: str) -> Optional[str]:
        return (meta.get(k) or {}).get("value")

    if (m("NonFree") or "").lower() == "true":
        return None
    license_short = strip_html(m("LicenseShortName"))
    return {
        "url": clean_url(ii.get("url")),
        "thumb_url": clean_url(ii.get("thumburl")),
        "width": ii.get("width"),
        "height": ii.get("height"),
        "artist": strip_html(m("Artist")) or strip_html(m("Credit")),
        "license": license_short,
        "license_url": m("LicenseUrl") or None,
        "source_url": ii.get("descriptionurl"),
        "provider": "Wikimedia Commons",
        "file": name,
    }


def wikidata(f: Fetcher, qid: Optional[str], stamps: List[float]) -> Dict[str, Any]:
    if not qid:
        return {}
    body, ts = f.get(WIKIDATA_API, {"action": "wbgetentities", "ids": qid, "props": "claims", "format": "json"})
    stamps.append(ts)
    ent = ((body or {}).get("entities") or {}).get(qid) or {}
    claims = ent.get("claims") or {}

    def values(pid: str) -> List[Tuple[str, Any]]:
        out = []
        for c in claims.get(pid, []):
            dv = (c.get("mainsnak") or {}).get("datavalue") or {}
            out.append((c.get("rank"), dv.get("value")))
        return out

    taxon_names = [v for _, v in values("P225") if isinstance(v, str)]
    status = None
    p141 = [(r, v.get("id")) for r, v in values("P141") if isinstance(v, dict)]
    preferred = [q for r, q in p141 if r == "preferred"] or [q for r, q in p141 if r == "normal"]
    if preferred:
        status = WIKIDATA_IUCN.get(preferred[0])
        if status is None:  # unknown status item: map by its English label
            lab, ts = f.get(WIKIDATA_API, {"action": "wbgetentities", "ids": preferred[0], "props": "labels",
                                           "languages": "en", "format": "json"})
            stamps.append(ts)
            text = ((((lab or {}).get("entities") or {}).get(preferred[0]) or {}).get("labels") or {}).get("en", {})
            text = (text.get("value") or "").lower().replace(" species", "").strip()
            status = {v.lower(): k for k, v in IUCN_LABELS.items()}.get(text)
            print(f"    note: P141 value {preferred[0]} ({text!r}) mapped to {status}", file=sys.stderr)
    return {"qid": qid, "taxon_names": taxon_names, "iucn": status, "iucn_qid": preferred[0] if preferred else None}


def inaturalist(f: Fetcher, name: str, pinned: Optional[int], stamps: List[float]) -> Dict[str, Any]:
    tid = pinned
    if tid is None:
        body, ts = f.get(INAT + "/taxa", {"q": name, "is_active": "true", "per_page": 10})
        stamps.append(ts)
        results = (body or {}).get("results") or []
        exact = [t for t in results if (t.get("name") or "").lower() == name.lower()]
        exact = [t for t in exact if t.get("iconic_taxon_name") in ANIMAL_ICONIC] or exact
        if not exact:
            return {}
        tid = exact[0]["id"]
    body, ts = f.get(f"{INAT}/taxa/{tid}")
    stamps.append(ts)
    results = (body or {}).get("results") or []
    if not results:
        return {}
    t = results[0]
    ancestors = t.get("ancestors") or []
    lineage = {a.get("rank"): a.get("name") for a in ancestors}
    lineage[t.get("rank")] = t.get("name")
    status = None
    for cs in t.get("conservation_statuses") or []:
        if cs.get("place") is None and "iucn" in (cs.get("authority") or "").lower():
            status = INAT_IUCN.get(cs.get("iucn"))
            break
    if status is None:
        cs = t.get("conservation_status") or {}
        if cs.get("place") is None and "iucn" in (cs.get("authority") or "").lower():
            status = INAT_IUCN.get(cs.get("iucn"))
    photo = t.get("default_photo") or {}
    return {
        "id": t.get("id"),
        "name": t.get("name"),
        "rank": t.get("rank"),
        "common_name": t.get("preferred_common_name"),
        "observations_count": t.get("observations_count"),
        "iconic_taxon_name": t.get("iconic_taxon_name"),
        "lineage": lineage,
        "lineage_names": [a.get("name") for a in ancestors] + [t.get("name")],
        "iucn": status,
        "photo": photo,
    }


def gbif(f: Fetcher, name: str, lineage_names: List[str], stamps: List[float]) -> Dict[str, Any]:
    body, ts = f.get(GBIF + "/species/match", {"name": name, "kingdom": "Animalia", "verbose": "true"})
    stamps.append(ts)
    if not body:
        return {}
    lineage = set(lineage_names)

    def ok(c: Dict[str, Any]) -> bool:
        if (c.get("canonicalName") or "").lower() != name.lower() or c.get("kingdom") != "Animalia":
            return False
        # a one-word name is a genus or higher: never accept a species-rank record for it
        return " " in name or (c.get("rank") or "").upper() not in ("SPECIES", "SUBSPECIES", "FORM", "VARIETY")

    cands = []
    if body.get("matchType") == "EXACT" and ok(body):
        cands.append(body)
    cands += [a for a in body.get("alternatives") or [] if ok(a) and a.get("status") == "ACCEPTED"]
    # Prefer a candidate whose higher classification overlaps the iNaturalist lineage (homonyms).
    def score(c: Dict[str, Any]) -> int:
        return len({c.get(k) for k in ("phylum", "class", "order", "family")} & lineage)
    cands.sort(key=score, reverse=True)
    if not cands or (lineage and score(cands[0]) == 0 and cands[0] is not body):
        return {}
    c = cands[0]
    return {"key": c.get("usageKey"), "name": c.get("canonicalName"), "rank": (c.get("rank") or "").lower()}


# ---------------------------------------------------------------- build
def build_entry(f: Fetcher, label: str, ov: Dict[str, Any], acc: Dict[str, float], counts: Dict[str, int],
                warnings: List[str]) -> Dict[str, Any]:
    stamps: List[float] = []
    taxon = ov["taxon"]
    wp = wikipedia(f, ov["wikipedia_title"], stamps)
    if wp.get("type") == "disambiguation":
        warnings.append(f"{label}: Wikipedia page {ov['wikipedia_title']!r} is a disambiguation page")

    # image: pinned Commons file > article lead image (Commons) > iNaturalist default photo
    image = None
    name = ov.get("image_file") or page_image_name(f, wp.get("title") or ov["wikipedia_title"], stamps)
    if name:
        image = commons_image(f, name, stamps)
    wd = wikidata(f, wp.get("wikibase_item"), stamps)
    inat = inaturalist(f, taxon, ov.get("inat_taxon_id"), stamps)
    if image is None and inat.get("photo", {}).get("license_code"):
        p = inat["photo"]
        image = {
            "url": p.get("original_url") or p.get("medium_url"),
            "thumb_url": p.get("medium_url"),
            "width": (p.get("original_dimensions") or {}).get("width"),
            "height": (p.get("original_dimensions") or {}).get("height"),
            "artist": strip_html(p.get("attribution")),
            "license": p.get("license_code").upper().replace("CC-", "CC "),
            "license_url": None,
            "source_url": f"https://www.inaturalist.org/photos/{p.get('id')}",
            "provider": "iNaturalist",
            "file": None,
        }

    gb: Dict[str, Any] = {}
    gbif_name = ov["gbif_name"] if "gbif_name" in ov else taxon
    if ov.get("gbif_taxon_key"):
        body, ts = f.get(f"{GBIF}/species/{ov['gbif_taxon_key']}")
        stamps.append(ts)
        gb = {"key": ov["gbif_taxon_key"], "name": (body or {}).get("canonicalName") or gbif_name,
              "rank": ((body or {}).get("rank") or "").lower() or None}
    elif gbif_name:
        gb = gbif(f, gbif_name, inat.get("lineage_names") or [], stamps)
        if not gb:
            warnings.append(f"{label}: no GBIF backbone match for {gbif_name!r}")

    # --- IUCN status
    na_reason = None
    if ov.get("is_group"):
        na_reason = "Not applicable (group)"
    elif ov.get("hybrid"):
        na_reason = "Not applicable (hybrid)"
    elif ov.get("domestic"):
        na_reason = "Not applicable (domesticated form)"
    wd_code = wd.get("iucn") if taxon in wd.get("taxon_names", []) else None
    if wd.get("iucn") and taxon not in wd.get("taxon_names", []):
        warnings.append(f"{label}: Wikidata {wd.get('qid')} taxon {wd.get('taxon_names')} != {taxon!r}; P141 ignored")
    inat_code = inat.get("iucn") if (inat.get("name") or "").lower() == taxon.lower() else None
    if na_reason:
        iucn = {"code": None, "label": na_reason, "source": None}
    elif wd_code:
        iucn = {"code": wd_code, "label": IUCN_LABELS[wd_code],
                "source": "IUCN Red List via Wikidata (P141)",
                "source_url": f"https://www.wikidata.org/wiki/{wd['qid']}"}
        if inat_code and inat_code != wd_code:
            warnings.append(f"{label}: IUCN Wikidata={wd_code} vs iNaturalist={inat_code} (Wikidata used)")
    elif inat_code:
        iucn = {"code": inat_code, "label": IUCN_LABELS[inat_code],
                "source": "IUCN Red List via iNaturalist",
                "source_url": f"https://www.inaturalist.org/taxa/{inat['id']}"}
    else:
        iucn = {"code": None, "label": "Unknown (no assessment found)", "source": None}
        warnings.append(f"{label}: no IUCN status found for species {taxon!r}")

    lineage = inat.get("lineage") or {}
    taxonomy = {k: lineage.get(k) for k in ("phylum", "class", "order", "family", "genus")}
    group = ov.get("animal_group") or animal_group(inat.get("lineage_names") or [])

    fetched = max(stamps) if stamps else None
    return {
        "label": label,
        "slug": slugify(label),
        "common_name": ov.get("common_name") or label,
        "scientific_name": ov.get("scientific_name") or taxon,
        "rank": ov["rank"],
        "is_group": bool(ov["is_group"]),
        "domestic": bool(ov.get("domestic", False)),
        "rank_note": ov["rank_note"],
        "taxonomy": taxonomy,
        "animal_group": group,
        "summary": wp.get("extract"),
        "description": wp.get("description"),
        "wikipedia_title": wp.get("title") or ov["wikipedia_title"],
        "wikipedia_url": wp.get("url"),
        "wikidata_id": wd.get("qid"),
        "image": image,
        "iucn_status": iucn,
        "gbif_taxon_key": gb.get("key"),
        "gbif_taxon": {"name": gb.get("name"), "rank": gb.get("rank"), "note": ov.get("gbif_note")} if (gb or ov.get("gbif_note")) else None,
        "inaturalist_taxon_id": inat.get("id"),
        "inaturalist_taxon": {"name": inat.get("name"), "rank": inat.get("rank"),
                              "common_name": inat.get("common_name")} if inat else None,
        "inaturalist_observations": inat.get("observations_count"),
        "model_stats": {
            "model": "efficientnetv2_s",
            "test_accuracy": round(acc[label], 6) if label in acc else None,
            "test_images": counts.get(label),
            "source": "outputs/results/efficientnetv2_s_evaluation.json (per_class_accuracy); test images from data/manifest.csv",
        },
        "fetched_at": datetime.fromtimestamp(fetched, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if fetched else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore the raw cache and refetch")
    ap.add_argument("--only", nargs="*", help="build only these labels (debugging; output not written)")
    args = ap.parse_args()

    classes = json.loads(CLASSES.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))["species"]
    missing_ov = [c for c in classes if c not in overrides]
    if missing_ov:
        print("missing overrides:", missing_ov, file=sys.stderr)
        return 1
    evaluation = json.loads(EVALUATION.read_text(encoding="utf-8"))   # required: fail loudly if missing
    acc = evaluation.get("per_class_accuracy") or {}
    counts = test_counts()

    f = Fetcher(refresh=args.refresh)
    warnings: List[str] = []
    entries = []
    for i, label in enumerate(args.only or classes, 1):
        print(f"[{i:2d}/{len(args.only or classes)}] {label}", flush=True)
        entries.append(sanitize_urls(build_entry(f, label, overrides[label], acc, counts, warnings)))

    if args.only:
        print(json.dumps(entries, indent=2, ensure_ascii=False))
    else:
        kb = {
            "version": 1,
            "generated_by": "scripts/build_species_kb.py",
            "model": {"id": "efficientnetv2_s", "test_accuracy": evaluation.get("test_top1_accuracy"),
                      "test_samples": evaluation.get("test_samples")},
            "iucn_precedence": "groups/domestic/hybrid -> not applicable; else Wikidata P141 (if the item's "
                               "P225 equals the taxon); else iNaturalist global IUCN status",
            "species": entries,
        }
        OUT.write_text(json.dumps(kb, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nwrote {OUT.relative_to(REPO)} ({len(entries)} entries, {f.network_calls} network requests)")

    # ---- coverage report
    def has(e: Dict[str, Any], k: str) -> bool:
        if k == "image":
            return bool(e["image"] and e["image"].get("url") and e["image"].get("license"))
        if k == "iucn":
            return e["iucn_status"]["code"] is not None or e["iucn_status"]["label"].startswith("Not applicable")
        return e.get(k) not in (None, "", [])

    fields = ["summary", "image", "scientific_name", "iucn", "gbif_taxon_key", "inaturalist_taxon_id",
              "inaturalist_observations", "wikipedia_url"]
    print("\ncoverage:")
    for k in fields:
        miss = [e["label"] for e in entries if not has(e, k)]
        print(f"  {k:26s} {len(entries) - len(miss):3d}/{len(entries)}" + (f"  missing: {miss}" if miss else ""))
    print("  groups:", sum(e["is_group"] for e in entries), " domestic:", sum(e["domestic"] for e in entries),
          " species with IUCN code:", sum(e["iucn_status"]["code"] is not None for e in entries))
    print("  animal_group:", dict(Counter(e["animal_group"] for e in entries)))
    if warnings:
        print("\nwarnings:")
        for w in warnings:
            print("  -", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
