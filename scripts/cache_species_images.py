"""
Phase 4: download species photographs for offline local mode.

For each of the 80 entries in data/species_kb.json, fetch one hero image
(1280 px wide) and one card thumbnail (500 px wide) from Wikimedia Commons'
standard thumbnail sizes into data/species_images/ (gitignored), and write
data/species_images/manifest.json. The backend serves the directory at
/api/species-images/... and the frontend uses those URLs when present, falling
back to the Commons thumbnail URL otherwise. Attribution stays in the KB.

Polite by design: generic User-Agent, one request at a time with a 2 s delay,
honours Retry-After on 429/503, skips files that already exist.

Usage (from the repo root; stdlib only):
    python3 scripts/cache_species_images.py            # fetch what is missing
    python3 scripts/cache_species_images.py --refresh  # re-download everything
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KB_PATH = ROOT / "data" / "species_kb.json"
OUT_DIR = ROOT / "data" / "species_images"
MANIFEST = OUT_DIR / "manifest.json"
USER_AGENT = "WildLens/0.1 (educational student project)"
SIZES = {"hero": 1280, "card": 500}
# Wikimedia serves (and caches) these widths; arbitrary widths may be refused.
STANDARD_WIDTHS = (330, 500, 960, 1280, 1920)
COMMONS = re.compile(r"^https://upload\.wikimedia\.org/wikipedia/commons/([0-9a-f])/([0-9a-f]{2})/([^/]+)$")


def thumb_url(url: str, width: int, original_width: int | None) -> str:
    """Same rule as frontend/src/lib/images.ts commonsThumb()."""
    m = COMMONS.match(url)
    if not m:
        return url
    target = next((w for w in STANDARD_WIDTHS if w >= width), 1920)
    if original_width and original_width <= target:
        return url
    a, ab, file = m.groups()
    suffix = ".png" if re.search(r"\.(tiff?|svg)$", file, re.I) else ""
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{a}/{ab}/{file}/{target}px-{file}{suffix}"


def extension(url: str) -> str:
    ext = url.rsplit(".", 1)[-1].lower()
    return {"jpeg": "jpg"}.get(ext, ext) if ext in ("jpg", "jpeg", "png", "webp", "gif") else "jpg"


def fetch(url: str, delay: float, retries: int = 4) -> bytes:
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            time.sleep(delay)
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < retries:
                ra = e.headers.get("Retry-After", "")
                wait = float(ra) if ra.replace(".", "", 1).isdigit() else delay * 2 ** (attempt + 2)
                print(f"  {e.code}; waiting {wait:.0f}s (Retry-After={ra or 'n/a'})")
                time.sleep(min(wait, 120))
                continue
            raise
        except urllib.error.URLError:
            if attempt < retries:
                time.sleep(delay * 2 ** (attempt + 1))
                continue
            raise
    raise RuntimeError("unreachable")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download existing files")
    ap.add_argument("--delay", type=float, default=2.0, help="seconds between requests (default 2.0)")
    args = ap.parse_args()

    kb = json.loads(KB_PATH.read_text(encoding="utf-8"))["species"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, str]] = {}
    failures = 0
    for e in kb:
        img = e.get("image") or {}
        url = img.get("url")
        if not url:
            print(f"{e['slug']}: no image in KB")
            continue
        entry: dict[str, str] = {}
        for kind, width in SIZES.items():
            src = thumb_url(url, width, img.get("width"))
            name = f"{e['slug']}-{kind}.{extension(src)}"
            path = OUT_DIR / name
            if path.exists() and path.stat().st_size > 0 and not args.refresh:
                entry[kind] = name
                continue
            try:
                data = fetch(src, args.delay)
            except Exception as exc:  # noqa: BLE001 - report and continue
                failures += 1
                print(f"{e['slug']} {kind}: FAILED {exc}")
                continue
            path.write_bytes(data)
            entry[kind] = name
            print(f"{e['slug']} {kind}: {len(data) / 1024:.0f} KB")
        if entry:
            manifest[e["slug"]] = entry

    MANIFEST.write_text(json.dumps({"source": "Wikimedia Commons thumbnails of data/species_kb.json images",
                                    "images": manifest}, indent=1) + "\n")
    total = sum(p.stat().st_size for p in OUT_DIR.iterdir() if p.is_file())
    print(f"\n{len(manifest)}/{len(kb)} species cached, {failures} failures, "
          f"{total / 1e6:.1f} MB in {OUT_DIR.relative_to(ROOT)}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
