/** Identify page state (kept for the session so "back" shows the last result) and error copy. */
import { ApiError } from '@/lib/api'
import { getInferenceEngine, INFERENCE_MODE, type IdentifyResult, type LoadProgress } from '@/lib/inference'
import { createStore } from '@/lib/store'

export interface IdentifyError {
  title: string
  message: string
  detail?: string
}

export interface IdentifyState {
  status: 'idle' | 'loading' | 'done' | 'error'
  /** Object URL (uploads) or static URL (samples) of the photo being shown. */
  imageUrl: string | null
  fileName: string | null
  sampleSlug: string | null
  result: IdentifyResult | null
  error: IdentifyError | null
  progress: LoadProgress | null
}

const initial: IdentifyState = {
  status: 'idle',
  imageUrl: null,
  fileName: null,
  sampleSlug: null,
  result: null,
  error: null,
  progress: null,
}

export const identifyStore = createStore<IdentifyState>(initial)

export function describeIdentifyError(err: unknown): IdentifyError {
  if (err instanceof ApiError) {
    const detail = `HTTP ${err.status}`
    switch (err.status) {
      case 413:
        return { title: 'This photo is too large', message: err.detail || 'The limit is 10 MB.', detail }
      case 415:
        return {
          title: 'Unsupported image format',
          message: `${err.detail} Use a JPEG, PNG or WebP photograph.`,
          detail,
        }
      case 422:
        return { title: 'This file could not be read as a photo', message: err.detail, detail }
      case 503:
        return {
          title: 'The model is not loaded',
          message:
            'The server is running but the ONNX model file is missing. Run scripts/download_models.sh from the repository root (or export it from the training checkpoint with scripts/export_onnx.py, see backend/README.md), then restart the server.',
          detail,
        }
      default:
        if (err.status >= 500)
          return {
            title: 'The identification server is not responding',
            message:
              'Start the backend (cd backend && .venv/bin/uvicorn app.main:app) and try again. Species pages and the sample gallery still work.',
            detail,
          }
        return { title: 'The photo could not be identified', message: err.detail, detail }
    }
  }
  if (err instanceof TypeError)
    return {
      title: 'The identification server is not reachable',
      message:
        INFERENCE_MODE === 'server'
          ? 'Start the backend (cd backend && .venv/bin/uvicorn app.main:app) and try again.'
          : 'A network request failed. Check your connection and try again.',
    }
  const message = err instanceof Error ? err.message : String(err)
  return { title: 'The photo could not be identified', message }
}

let current: AbortController | null = null

function releaseUrl(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

export async function identify(
  file: Blob,
  meta: { fileName: string; sampleSlug?: string; imageUrl?: string },
) {
  current?.abort()
  const controller = new AbortController()
  current = controller
  const prev = identifyStore.get()
  releaseUrl(prev.imageUrl)
  const imageUrl = meta.imageUrl ?? URL.createObjectURL(file)
  identifyStore.set({
    ...initial,
    status: 'loading',
    imageUrl,
    fileName: meta.fileName,
    sampleSlug: meta.sampleSlug ?? null,
  })
  try {
    const engine = await getInferenceEngine()
    const result = await engine.identify(file, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (current === controller) identifyStore.set((s) => ({ ...s, progress }))
      },
    })
    if (current !== controller) return
    identifyStore.set((s) => ({ ...s, status: 'done', result, progress: null }))
  } catch (err) {
    if (controller.signal.aborted || current !== controller) return
    identifyStore.set((s) => ({ ...s, status: 'error', error: describeIdentifyError(err), progress: null }))
  }
}

export async function identifySample(sample: { slug: string; file: string; common_name: string }) {
  try {
    const res = await fetch(sample.file)
    if (!res.ok) throw new Error(`Sample photo unavailable (${res.status}).`)
    const blob = await res.blob()
    const file = new File([blob], `${sample.slug}.jpg`, { type: blob.type || 'image/jpeg' })
    await identify(file, {
      fileName: `Sample: ${sample.common_name}`,
      sampleSlug: sample.slug,
      imageUrl: sample.file,
    })
  } catch (err) {
    identifyStore.set({ ...initial, status: 'error', error: describeIdentifyError(err) })
  }
}

export function resetIdentify() {
  current?.abort()
  current = null
  releaseUrl(identifyStore.get().imageUrl)
  identifyStore.reset()
}
