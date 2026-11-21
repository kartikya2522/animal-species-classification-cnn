# WildLens backend: FastAPI + ONNX Runtime (CPU). Build context: backend/
#   docker build -t wildlens-backend backend
# Model files, metrics, figures and the species KB are NOT baked in: docker-compose.yml
# bind-mounts them read-only under /srv (the app resolves relative paths against /srv).

# ---- build: install runtime dependencies into a venv -----------------------------------
FROM python:3.11-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
# Runtime only: drop the test runner (httpx stays, the chat uses it at runtime).
# sympy/mpmath (~85 MB) are pulled in by onnxruntime for its optional transformer tools only;
# pip/setuptools are not needed at runtime.
RUN grep -vE '^pytest==' /tmp/requirements.txt > /tmp/runtime.txt \
 && /opt/venv/bin/pip install -r /tmp/runtime.txt \
 && /opt/venv/bin/pip uninstall -y -q sympy mpmath \
 && /opt/venv/bin/pip uninstall -y -q pip setuptools \
 && find /opt/venv -name '__pycache__' -prune -exec rm -rf {} + \
 && /opt/venv/bin/python -m compileall -q /opt/venv/lib
COPY app /srv/backend/app
RUN /opt/venv/bin/python -m compileall -q /srv/backend/app

# ---- runtime -----------------------------------------------------------------------------
FROM python:3.11-slim
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN groupadd --system --gid 10001 wildlens \
 && useradd --system --uid 10001 --gid wildlens --home-dir /srv --no-create-home wildlens \
 && mkdir -p /srv/models /srv/outputs/results /srv/outputs/figures /srv/data
COPY --from=build /opt/venv /opt/venv
COPY --from=build /srv/backend /srv/backend
WORKDIR /srv/backend
USER wildlens
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]
# --proxy-headers: the per-IP chat rate limit sees the real client behind the nginx frontend.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
