/**
 * Browser mode: the same ONNX ResNet50 runs in the page with onnxruntime-web
 * (WebGPU when available, otherwise WebAssembly). The photo never leaves the browser.
 *
 * This module (and onnxruntime-web, which it imports dynamically) is only loaded when
 * VITE_INFERENCE_MODE=browser, so it is not part of the initial bundle.
 */
import classes from '@models/classes.json'
import registry from '@models/registry.json'
import fcUrl from '@models/efficientnetv2_s_fc.json?url'
import type { InferenceSession, Tensor } from 'onnxruntime-web'

import { decodeImage, grayscalePng } from '@/lib/inference/image'
import { camHeatmap, preprocessPixels, softmax, topK } from '@/lib/inference/math'
import { evictModel, fetchModel } from '@/lib/inference/model-cache'
import {
  CAM_METHOD,
  EXPLAIN_MAX_SIDE,
  LOW_CONFIDENCE_THRESHOLD,
  slugify,
  type IdentifyOptions,
  type IdentifyResult,
  type InferenceBackend,
  type InferenceEngine,
  type LoadProgress,
} from '@/lib/inference/types'

type Ort = typeof import('onnxruntime-web')

interface Variant {
  onnx: string
  usable: boolean
  sha256?: string
}

const entry = registry.models.find((m) => m.id === registry.default) ?? registry.models[0]!
const variants = entry.variants as Record<string, Variant | undefined>

/** Default model: the FP16 variant when the registry marks it usable (≥ 99% top-1 agreement), else FP32. */
export function defaultModelUrl(): string {
  const preferred = variants.fp16?.usable ? variants.fp16 : variants.fp32
  const file = (preferred?.onnx ?? entry.onnx).split('/').pop()
  return `/models/${file}`
}

export let MODEL_URL: string = import.meta.env.VITE_MODEL_URL || defaultModelUrl()
let EP_PREF: string = (import.meta.env.VITE_ORT_EP ?? 'auto').toLowerCase()

/** Override the model URL / execution provider before the first load (used by the parity test). */
export function configureBrowserModel(opts: { url?: string; ep?: 'auto' | 'wasm' | 'webgpu' }) {
  if (loading) throw new Error('configureBrowserModel() must be called before the model loads')
  if (opts.url) MODEL_URL = opts.url
  if (opts.ep) EP_PREF = opts.ep
}

function variantFor(url: string): string | null {
  const file = url.split('?')[0]?.split('/').pop()
  for (const [name, v] of Object.entries(variants)) if (v && v.onnx.split('/').pop() === file) return name
  return null
}

/** Registry SHA-256 of the file at `url` (matched by file name), used to key and verify the cache. */
export function modelSha256(url: string = MODEL_URL): string | null {
  const name = variantFor(url)
  return (name && variants[name]?.sha256) || null
}

interface Loaded {
  ort: Ort
  session: InferenceSession
  backend: InferenceBackend
  fcWeight: Float32Array
}

let loading: Promise<Loaded> | null = null

async function loadFc(): Promise<Float32Array> {
  const res = await fetch(fcUrl)
  if (!res.ok) throw new Error(`Could not load the classifier weights (${res.status}).`)
  const json = (await res.json()) as { shape: [number, number]; weight: number[] }
  return Float32Array.from(json.weight)
}

async function createSession(
  ort: Ort,
  bytes: Uint8Array,
): Promise<{ session: InferenceSession; backend: InferenceBackend }> {
  const pref = EP_PREF
  const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  const opts: InferenceSession.SessionOptions = { graphOptimizationLevel: 'all' }
  if (pref === 'webgpu' || (pref === 'auto' && hasGpu)) {
    try {
      const session = await ort.InferenceSession.create(bytes, { ...opts, executionProviders: ['webgpu'] })
      return { session, backend: 'webgpu' }
    } catch (err) {
      if (pref === 'webgpu') throw err
      // No usable adapter (e.g. headless or blocklisted GPU): fall back to WebAssembly.
    }
  }
  const session = await ort.InferenceSession.create(bytes, { ...opts, executionProviders: ['wasm'] })
  return { session, backend: 'wasm' }
}

async function load(onProgress?: (p: LoadProgress) => void, signal?: AbortSignal): Promise<Loaded> {
  onProgress?.({ phase: 'runtime' })
  const [ort, fcWeight] = await Promise.all([import('onnxruntime-web/webgpu'), loadFc()])
  // Multi-threaded WASM needs cross-origin isolation; otherwise run single-threaded.
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 1)
    : 1
  const sha256 = modelSha256(MODEL_URL)
  const model = await fetchModel(MODEL_URL, { sha256, onProgress, signal })
  onProgress?.({ phase: 'session' })
  let created: { session: InferenceSession; backend: InferenceBackend }
  try {
    created = await createSession(ort as unknown as Ort, model.bytes)
  } catch (err) {
    if (!model.fromCache) throw err
    // A cached copy that ONNX Runtime cannot load (corrupt or stale): drop it and retry once from the network.
    await evictModel(MODEL_URL, sha256)
    const fresh = await fetchModel(MODEL_URL, { sha256, onProgress, signal, bypassCache: true })
    onProgress?.({ phase: 'session' })
    created = await createSession(ort as unknown as Ort, fresh.bytes)
  }
  const { session, backend } = created
  onProgress?.({ phase: 'ready' })
  return { ort: ort as unknown as Ort, session, backend, fcWeight }
}

/** Start (or join) loading the runtime + model. Safe to call repeatedly. */
export function prepareBrowserModel(onProgress?: (p: LoadProgress) => void): Promise<Loaded> {
  if (!loading) {
    loading = load(onProgress).catch((err: unknown) => {
      loading = null
      throw err
    })
  }
  return loading
}

/** Raw outputs for one decoded image (exported for the parity test). */
export async function runPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  channels = 4,
): Promise<{
  probs: Float64Array
  features: Float32Array
  featureDims: readonly number[]
  ms: number
  backend: InferenceBackend
}> {
  const { ort, session, backend } = await prepareBrowserModel()
  const [h, w] = entry.input_size as [number, number]
  const t0 = performance.now()
  const x = preprocessPixels(pixels, width, height, w, entry.mean, entry.std, channels)
  const input = new ort.Tensor('float32', x, [1, 3, h, w])
  const out = await session.run({ [entry.inputs.name]: input })
  const logits = out.logits as Tensor
  const feats = out.features as Tensor
  const probs = softmax(logits.data as Float32Array)
  const ms = performance.now() - t0
  const features = feats.data as Float32Array
  input.dispose?.()
  return { probs, features, featureDims: feats.dims, ms, backend }
}

export class BrowserInference implements InferenceEngine {
  readonly mode = 'browser' as const

  async identify(file: Blob, opts: IdentifyOptions = {}): Promise<IdentifyResult> {
    const { fcWeight } = await prepareBrowserModel(opts.onProgress)
    opts.signal?.throwIfAborted()
    const img = await decodeImage(file)
    const run = await runPixels(img.data, img.width, img.height, 4)
    opts.signal?.throwIfAborted()

    const idx = topK(run.probs, 5)
    const predictions = idx.map((i) => ({
      label: classes[i] as string,
      index: i,
      probability: run.probs[i] as number,
    }))
    const top = predictions[0]!

    const t1 = performance.now()
    const [, K, gh, gw] = run.featureDims as [number, number, number, number]
    const cam = camHeatmap(run.features, fcWeight, top.index, {
      K,
      gridH: gh,
      gridW: gw,
      imageWidth: img.naturalWidth,
      imageHeight: img.naturalHeight,
      maxSide: EXPLAIN_MAX_SIDE,
    })
    const heatmapPng = await grayscalePng(cam.heat, cam.width, cam.height)
    const explainMs = performance.now() - t1

    return {
      mode: 'browser',
      backend: run.backend,
      model: entry.id,
      variant: variantFor(MODEL_URL),
      predictions,
      lowConfidence: top.probability < LOW_CONFIDENCE_THRESHOLD,
      threshold: LOW_CONFIDENCE_THRESHOLD,
      inferenceMs: run.ms,
      explainMs,
      image: { width: img.naturalWidth, height: img.naturalHeight },
      heatmapPng,
      heatmapWidth: cam.width,
      heatmapHeight: cam.height,
      method: CAM_METHOD,
      slugs: Object.fromEntries(predictions.map((p) => [p.label, slugify(p.label)])),
    }
  }
}
