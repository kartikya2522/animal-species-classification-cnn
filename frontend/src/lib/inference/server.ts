import { api } from '@/lib/api'
import {
  LOW_CONFIDENCE_THRESHOLD,
  type IdentifyOptions,
  type IdentifyResult,
  type InferenceEngine,
} from '@/lib/inference/types'

/**
 * Server mode: the FastAPI backend runs the ONNX model. A single /api/explain call returns the
 * top-5, the low-confidence flag and the amber CAM from one forward pass (`api.predict` stays
 * available for callers that need only the classification).
 */
export class ServerInference implements InferenceEngine {
  readonly mode = 'server' as const

  async identify(file: Blob, opts: IdentifyOptions = {}): Promise<IdentifyResult> {
    const exp = await api.explain(file, { colormap: 'amber', signal: opts.signal })
    return {
      mode: 'server',
      backend: 'server',
      model: exp.model,
      variant: null,
      predictions: exp.predictions.slice(0, 5),
      lowConfidence: exp.low_confidence,
      threshold: exp.low_confidence_threshold ?? LOW_CONFIDENCE_THRESHOLD,
      // Server-side preprocessing + forward pass (excludes upload and network time).
      inferenceMs: exp.inference_ms,
      explainMs: exp.explain_ms,
      image: { width: exp.image.width, height: exp.image.height },
      heatmapPng: exp.heatmap_png,
      heatmapWidth: exp.width,
      heatmapHeight: exp.height,
      method: exp.method,
      slugs: exp.slugs,
    }
  }
}
