#!/usr/bin/env bash
# Run a command with Node 22+ (frontend/.nvmrc). Uses the node on PATH if it is new enough,
# otherwise switches with nvm (installing the .nvmrc version if needed).
#   scripts/with-node.sh npm ci
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WANT="$(tr -d '[:space:]v' < "$ROOT/frontend/.nvmrc")"

node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

if [ "$(node_major)" -lt "$WANT" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    pushd "$ROOT/frontend" >/dev/null
    nvm use --silent >/dev/null 2>&1 || { nvm install >/dev/null && nvm use --silent >/dev/null; }
    popd >/dev/null
  fi
fi
if [ "$(node_major)" -lt "$WANT" ]; then
  echo "Node $WANT or newer is required (found: $(node -v 2>/dev/null || echo none))." >&2
  echo "Install it from https://nodejs.org or with nvm (https://github.com/nvm-sh/nvm): nvm install $WANT" >&2
  exit 1
fi
exec "$@"
