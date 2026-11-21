# Render backend: FastAPI + ONNX Runtime. Source from GitHub, model from the model-v1 release.
FROM alpine/git AS src
ARG REF=main
RUN git clone --depth 1 --branch ${REF} https://github.com/kartikya2522/animal-species-classification-cnn.git /src

FROM python:3.11-slim AS model
COPY --from=src /src/models /models
RUN python - <<'EOF'
import hashlib, json, urllib.request
url = "https://github.com/kartikya2522/animal-species-classification-cnn/releases/download/model-v1/efficientnetv2_s.onnx"
dest = "/models/efficientnetv2_s.onnx"
urllib.request.urlretrieve(url, dest)
want = json.load(open("/models/registry.json"))["models"][0]["variants"]["fp32"]["sha256"]
have = hashlib.sha256(open(dest, "rb").read()).hexdigest()
assert have == want, f"hash mismatch: {have} != {want}"
print("model verified")
EOF

FROM python:3.11-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
COPY --from=src /src/backend/requirements.txt /tmp/requirements.txt
RUN grep -vE '^pytest==' /tmp/requirements.txt > /tmp/runtime.txt \
 && /opt/venv/bin/pip install -r /tmp/runtime.txt \
 && /opt/venv/bin/pip uninstall -y -q sympy mpmath

FROM python:3.11-slim
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY --from=build /opt/venv /opt/venv
COPY --from=src /src/backend/app /srv/backend/app
COPY --from=model /models /srv/models
COPY --from=src /src/outputs/results /srv/outputs/results
COPY --from=src /src/outputs/figures /srv/outputs/figures
COPY --from=src /src/data/species_kb.json /srv/data/species_kb.json
WORKDIR /srv/backend
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips '*'