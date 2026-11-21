# WildLens: common tasks. Run `make help` for the list.
# Portable across macOS (BSD tools, bash 3.2) and Linux. Recipes run from the repo root.

SHELL := /bin/bash
.DEFAULT_GOAL := help

VENV        := backend/.venv
VENV_PY     := $(VENV)/bin/python
# Python 3.11 preferred (same as the Docker image); 3.9-3.12 work. Override: make setup PYTHON=python3.12
PYTHON      ?= $(shell for p in python3.11 python3.12 python3.10 python3.9 python3; do command -v $$p >/dev/null 2>&1 && { echo $$p; break; }; done)
NODE        := scripts/with-node.sh
ML_VENV_PY  := venv/bin/python
COMPOSE     := docker compose
APP_URL     := http://localhost:8080

.PHONY: help setup setup-backend setup-frontend dev test test-backend test-phase0 test-frontend e2e \
        check-models cache-images up down logs clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[1m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: setup-backend setup-frontend ## Install backend (Python venv) and frontend (npm ci) dependencies
	@echo
	@scripts/download_models.sh --check || echo "Models: see 'make check-models' (the app runs without them, identification does not)."
	@echo
	@echo "Setup complete. Start the app with: make dev"

setup-backend: $(VENV)/.requirements.stamp ## Create/refresh backend/.venv from backend/requirements.txt

$(VENV)/.requirements.stamp: backend/requirements.txt
	@test -n "$(PYTHON)" || { echo "Python 3.9-3.12 not found (3.11 recommended)." >&2; exit 1; }
	@$(PYTHON) -c 'import sys; v=sys.version_info[:2]; sys.exit(0 if (3,9) <= v <= (3,12) else "Python %d.%d is not supported (need 3.9-3.12, 3.11 recommended). Use: make setup PYTHON=python3.11" % v)'
	@[ -x $(VENV_PY) ] && $(VENV_PY) -c 'import sys' >/dev/null 2>&1 || { echo "Creating $(VENV) with $$($(PYTHON) --version)"; $(PYTHON) -m venv --clear $(VENV); }
	$(VENV_PY) -m pip install --quiet --upgrade pip
	$(VENV_PY) -m pip install --quiet -r backend/requirements.txt
	@touch $@

setup-frontend: frontend/node_modules/.package-lock.json ## npm ci in frontend/ (Node 22)

frontend/node_modules/.package-lock.json: frontend/package-lock.json frontend/package.json
	cd frontend && ../$(NODE) npm ci --no-audit --no-fund
	@touch $@

dev: ## Run backend (:8000) and frontend (:5173) together; Ctrl-C stops both
	@scripts/dev.sh

test: test-backend test-phase0 test-frontend ## Run all test suites except Playwright e2e

test-backend: setup-backend ## Backend pytest
	cd backend && .venv/bin/python -m pytest -q

test-phase0: ## Phase-0 model parity tests (needs the ML venv in venv/ with torch; skipped otherwise)
	@if [ -x $(ML_VENV_PY) ]; then $(ML_VENV_PY) -m pytest -q tests/phase0; \
	else echo "Skipping tests/phase0: no ML venv at venv/ (python3 -m venv venv && venv/bin/pip install -r scripts/requirements-export.txt)."; fi

test-frontend: setup-frontend ## Frontend typecheck, lint, format check and Vitest
	cd frontend && ../$(NODE) npm run typecheck
	cd frontend && ../$(NODE) npm run lint
	cd frontend && ../$(NODE) npm run format:check
	cd frontend && ../$(NODE) npm test

e2e: setup-backend setup-frontend ## Playwright end-to-end tests (starts both servers; needs models/efficientnetv2_s.onnx)
	cd frontend && ../$(NODE) npx playwright install chromium
	cd frontend && ../$(NODE) npm run e2e

check-models: ## Verify the local model files against the SHA-256 in models/registry.json
	@scripts/download_models.sh --check; status=$$?; \
	if [ $$status -ne 0 ]; then \
	  echo; \
	  echo "The ONNX model files are not published. Copy efficientnetv2_s.onnx and efficientnetv2_s.fp16.onnx from a"; \
	  echo "teammate into models/, or export them from the training checkpoint (scripts/download_models.sh --help)."; \
	  echo "The app still starts without them; only identification is unavailable."; \
	fi; exit $$status

cache-images: ## Download the species photos for offline use into data/species_images/ (~32 MB)
	@$(or $(wildcard $(VENV_PY)),python3) scripts/cache_species_images.py

up: ## Build and start the Docker stack (http://localhost:8080)
	@scripts/download_models.sh --check fp32 >/dev/null 2>&1 || echo "Note: models/efficientnetv2_s.onnx is missing or unverified (make check-models); identification will be unavailable."
	$(COMPOSE) up --build -d --wait
	@echo
	@echo "  WildLens is running:  $(APP_URL)   (logs: make logs, stop: make down)"

down: ## Stop and remove the Docker stack
	$(COMPOSE) down

logs: ## Follow the Docker stack's logs
	$(COMPOSE) logs -f

clean: ## Remove frontend build output and test artefacts (keeps venvs and node_modules)
	cd frontend && rm -rf dist test-results playwright-report
