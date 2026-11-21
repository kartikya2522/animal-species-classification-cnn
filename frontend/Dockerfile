# WildLens frontend: Vite production build served by nginx, /api proxied to the backend.
# Build context: the repository root (the build imports models/registry.json, classes.json and
# efficientnetv2_s_fc.json; see the root .dockerignore, which never sends ONNX weights).
#   docker build -f frontend/Dockerfile -t wildlens-frontend .

# ---- build ---------------------------------------------------------------------------------
FROM node:22-slim AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm_config_update_notifier=false
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY models/registry.json models/classes.json models/efficientnetv2_s_fc.json /src/models/
COPY frontend/ ./
# server (default): the backend runs the model. browser: onnxruntime-web runs it in the page,
# fetching /models/*.onnx, which nginx serves from the read-only models/ bind mount.
ARG VITE_INFERENCE_MODE=server
ENV VITE_INFERENCE_MODE=$VITE_INFERENCE_MODE
RUN npm run build

# ---- serve -----------------------------------------------------------------------------------
FROM nginx:1.27-alpine
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY frontend/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /src/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
