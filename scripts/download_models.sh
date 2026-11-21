#!/usr/bin/env bash
# Download the ONNX model files (gitignored) into models/ and verify their SHA-256.
#
#   scripts/download_models.sh              # fp32 (server) + fp16 (browser default)
#   scripts/download_models.sh fp32         # only some variants (fp32 | fp16 | int8)
#   scripts/download_models.sh --check      # only verify files already in models/
#
# URL and expected hash come from models/registry.json (`variants.<name>.download_url` and
# `.sha256`). Files that are already present with the right hash are skipped. A download is
# written to a temporary file and only moved into place after its hash matches.
#
# Until the files are hosted (Phase 7) `download_url` is empty and this
# script says so. Team members can instead
#   * copy the files from a teammate into models/ and run `scripts/download_models.sh --check`, or
#   * export them from the training checkpoint (outputs\models\efficientnetv2_s.pth, not in git):
#       python -m venv venv && venv/bin/pip install -r scripts/requirements-export.txt
#       venv/bin/python scripts/export_onnx.py --fp16      # writes efficientnetv2_s.onnx + efficientnetv2_s.fp16.onnx
#       venv/bin/python scripts/evaluate_onnx.py           # accuracy + variant agreement
#     (a re-export changes the hashes; export_onnx.py rewrites them in the registry).
#
# Exit codes: 0 all requested files present and verified; 1 a download or hash check failed;
# 2 a file is missing and no download URL is configured yet.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${WILDLENS_REGISTRY:-$ROOT/models/registry.json}"
CHECK_ONLY=0
VARIANTS=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    fp32|fp16|int8) VARIANTS+=("$arg") ;;
    *) echo "download_models.sh: unknown argument '$arg' (try --help)" >&2; exit 1 ;;
  esac
done
[ ${#VARIANTS[@]} -eq 0 ] && VARIANTS=(fp32 fp16)

command -v python3 >/dev/null || { echo "download_models.sh: python3 is required to read $REGISTRY" >&2; exit 1; }
[ -f "$REGISTRY" ] || { echo "download_models.sh: $REGISTRY not found" >&2; exit 1; }

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# Prints "<onnx path>|<download_url>|<sha256>" for a variant of the default model ("|" rather
# than a tab: whitespace IFS would merge the empty URL field).
variant_info() {
  python3 - "$REGISTRY" "$1" <<'PY'
import json, sys
reg = json.load(open(sys.argv[1]))
model = next((m for m in reg["models"] if m["id"] == reg.get("default")), reg["models"][0])
v = (model.get("variants") or {}).get(sys.argv[2])
if not v:
    sys.exit(f"variant {sys.argv[2]!r} is not in the registry")
print("|".join([v["onnx"], v.get("download_url") or "", v.get("sha256") or ""]))
PY
}

status=0
for variant in "${VARIANTS[@]}"; do
  IFS='|' read -r rel url want < <(variant_info "$variant")
  case "$rel" in /*) dest="$rel" ;; *) dest="$ROOT/$rel" ;; esac
  if [ -z "$want" ]; then
    echo "[$variant] no sha256 in the registry for $rel; refusing to trust any file." >&2
    status=1; continue
  fi
  if [ -f "$dest" ]; then
    have="$(sha256_of "$dest")"
    if [ "$have" = "$want" ]; then
      echo "[$variant] $rel present, SHA-256 verified."
      continue
    fi
    echo "[$variant] $rel exists but its SHA-256 does not match the registry" >&2
    echo "          (have $have, want $want)." >&2
    if [ "$CHECK_ONLY" -eq 1 ] || [ -z "$url" ]; then status=1; continue; fi
  elif [ "$CHECK_ONLY" -eq 1 ]; then
    echo "[$variant] $rel is missing." >&2
    status=$(( status == 1 ? 1 : 2 )); continue
  fi

  if [ -z "$url" ]; then
    echo "[$variant] $rel is missing and no download URL is configured yet" >&2
    echo "          (models/registry.json -> variants.$variant.download_url is empty; hosting is Phase 7)." >&2
    echo "          Copy the file from a teammate and run '$0 --check', or export it from the" >&2
    echo "          checkpoint: venv/bin/python scripts/export_onnx.py --fp16 (see the header of this script)." >&2
    status=$(( status == 1 ? 1 : 2 )); continue
  fi

  command -v curl >/dev/null || { echo "download_models.sh: curl is required" >&2; exit 1; }
  tmp="$dest.part"
  echo "[$variant] downloading $url"
  if ! curl -fL --retry 3 --progress-bar -o "$tmp" "$url"; then
    rm -f "$tmp"; echo "[$variant] download failed." >&2; status=1; continue
  fi
  have="$(sha256_of "$tmp")"
  if [ "$have" != "$want" ]; then
    rm -f "$tmp"
    echo "[$variant] SHA-256 mismatch for the downloaded file (have $have, want $want); not installed." >&2
    status=1; continue
  fi
  mv -f "$tmp" "$dest"
  echo "[$variant] $rel installed, SHA-256 verified."
done
exit "$status"
