/**
 * Inference adapter. One interface, two implementations, chosen at build time by
 * VITE_INFERENCE_MODE (`server` default | `browser`). The browser implementation and
 * onnxruntime-web are loaded with a dynamic import, so server-mode builds never fetch them.
 */
import { ServerInference } from '@/lib/inference/server'
import type { InferenceEngine, InferenceMode } from '@/lib/inference/types'

export * from '@/lib/inference/types'

export const INFERENCE_MODE: InferenceMode =
  (import.meta.env.VITE_INFERENCE_MODE ?? '').toLowerCase() === 'browser' ? 'browser' : 'server'

let engine: Promise<InferenceEngine> | null = null

export function getInferenceEngine(mode: InferenceMode = INFERENCE_MODE): Promise<InferenceEngine> {
  if (mode === 'server') return Promise.resolve(new ServerInference())
  engine ??= import('@/lib/inference/browser').then((m) => new m.BrowserInference())
  return engine
}

/** Browser mode only: begin downloading the runtime + model in the background. */
export async function prepareInference(
  onProgress?: Parameters<typeof import('@/lib/inference/browser').prepareBrowserModel>[0],
) {
  if (INFERENCE_MODE !== 'browser') return
  const m = await import('@/lib/inference/browser')
  await m.prepareBrowserModel(onProgress)
}

/** Browser mode only: model URL and whether it is already cached. */
export async function browserModelInfo(): Promise<{ url: string; cached: boolean } | null> {
  if (INFERENCE_MODE !== 'browser') return null
  const [{ MODEL_URL, modelSha256 }, { isModelCached }] = await Promise.all([
    import('@/lib/inference/browser'),
    import('@/lib/inference/model-cache'),
  ])
  return { url: MODEL_URL, cached: await isModelCached(MODEL_URL, modelSha256(MODEL_URL)) }
}
