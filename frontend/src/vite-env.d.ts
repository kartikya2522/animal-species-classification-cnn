/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin; empty = same origin (dev/preview proxy). */
  readonly VITE_API_BASE?: string
  /** Include the /__ui component preview in a production build ("true"). */
  readonly VITE_UI_PREVIEW?: string
  readonly VITE_REPO_URL?: string
  /** `server` (default): /api/predict + /api/explain. `browser`: onnxruntime-web in the page. */
  readonly VITE_INFERENCE_MODE?: string
  /** ONNX model URL for browser mode (default: the local file served by the Vite dev/preview server). */
  readonly VITE_MODEL_URL?: string
  /** Execution provider for browser mode: `auto` (WebGPU if available, else WASM), `wasm` or `webgpu`. */
  readonly VITE_ORT_EP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
