import type { Prediction } from '@/lib/api'

export type InferenceMode = 'server' | 'browser'

/** Where the forward pass ran. */
export type InferenceBackend = 'server' | 'wasm' | 'webgpu'

/** One identification: top-5, low-confidence flag and a CAM heatmap for the top-1 class. */
export interface IdentifyResult {
  mode: InferenceMode
  backend: InferenceBackend
  model: string
  /** Model variant actually used, e.g. `fp32` or `fp16`. */
  variant: string | null
  predictions: Prediction[]
  lowConfidence: boolean
  threshold: number
  /** Preprocessing + forward pass + softmax, as measured where it ran. */
  inferenceMs: number
  /** CAM computation + rendering. */
  explainMs: number | null
  /** Uploaded image size (after EXIF orientation). */
  image: { width: number; height: number }
  /** Grayscale heatmap PNG (base64 or data URL) at `heatmapWidth`×`heatmapHeight`. */
  heatmapPng: string
  heatmapWidth: number
  heatmapHeight: number
  method: string
  /** `{label: slug}` for linking to species pages. */
  slugs: Record<string, string>
}

export interface LoadProgress {
  phase: 'runtime' | 'model' | 'session' | 'ready'
  loaded?: number
  total?: number
  fromCache?: boolean
}

export interface IdentifyOptions {
  signal?: AbortSignal
  onProgress?: (p: LoadProgress) => void
}

export interface InferenceEngine {
  readonly mode: InferenceMode
  identify(file: Blob, opts?: IdentifyOptions): Promise<IdentifyResult>
}

export const LOW_CONFIDENCE_THRESHOLD = 0.5
export const EXPLAIN_MAX_SIDE = 1024
export const CAM_METHOD = 'CAM (== Grad-CAM for this GAP->Linear head), last conv block'

/** Same rule as the KB slugs (verified for all 80 labels). */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
