#!/usr/bin/env bash
# Start the backend (uvicorn --reload) and the frontend (Vite) together; Ctrl-C stops both.
# Used by `make dev`. Ports: BACKEND_PORT (8000), FRONTEND_PORT (5173).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if [ ! -x "$ROOT/backend/.venv/bin/uvicorn" ] || [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Dependencies are not installed yet: run 'make setup' first." >&2
  exit 1
fi
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if command -v lsof >/dev/null && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use (another 'make dev' or 'make up'?). Stop it or set BACKEND_PORT/FRONTEND_PORT." >&2
    exit 1
  fi
done
"$ROOT/scripts/download_models.sh" --check fp32 >/dev/null 2>&1 ||
  echo "Note: models/efficientnetv2_s.onnx is missing or unverified; identification will be unavailable (see 'make check-models')." >&2

BPID="" FPID=""
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping WildLens..."
  [ -n "$FPID" ] && kill "$FPID" 2>/dev/null
  [ -n "$BPID" ] && kill "$BPID" 2>/dev/null
  wait 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT
trap 'exit 0' INT TERM   # Ctrl-C is the normal way to stop; the EXIT trap cleans up

(cd "$ROOT/backend" && exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port "$BACKEND_PORT") &
BPID=$!
(cd "$ROOT/frontend" && WILDLENS_API_URL="http://127.0.0.1:$BACKEND_PORT" exec "$ROOT/scripts/with-node.sh" \
  node_modules/.bin/vite --port "$FRONTEND_PORT" --strictPort --clearScreen false) &
FPID=$!

# Wait for both servers, then print the address.
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1 &&
     curl -fsS "http://localhost:$FRONTEND_PORT/" >/dev/null 2>&1; then
    echo
    echo "  WildLens is running:  http://localhost:$FRONTEND_PORT"
    echo "  API docs:             http://127.0.0.1:$BACKEND_PORT/docs"
    echo "  Press Ctrl-C to stop both servers."
    echo
    break
  fi
  kill -0 "$BPID" 2>/dev/null && kill -0 "$FPID" 2>/dev/null || break
  sleep 1
done

# Exit (and stop the other) as soon as either server stops.
while kill -0 "$BPID" 2>/dev/null && kill -0 "$FPID" 2>/dev/null; do sleep 1; done
echo "A server stopped unexpectedly; shutting down the other." >&2
exit 1
