/**
 * Typed client for the WildLens FastAPI backend (see backend/README.md and
 * backend/app/schemas.py). Types mirror the Pydantic response models; helpers are
 * thin fetch wrappers. No page wiring here — pages use these through TanStack Query.
 */

import type { IucnCode } from '@/lib/iucn'

/* ------------------------------------------------------------------ config */

/** Base URL for the API. Empty = same origin (Vite dev/preview proxy `/api` to :8000). */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

/* ------------------------------------------------------------------ errors */

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/* ------------------------------------------------------------------ health / models */

export interface ModelStatus {
  id: string
  loaded: boolean
  error: string | null
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | string
  version: string
  default_model: string
  models: ModelStatus[]
}

export interface TestMetricsSummary {
  test_accuracy: number | null
  test_top5_accuracy: number | null
  macro_f1: number | null
  macro_roc_auc: number | null
  test_samples: number | null
}

export interface ModelInfo {
  id: string
  display_name: string
  architecture: string
  variant: string
  num_classes: number
  input_size: [number, number] | number[]
  loaded: boolean
  supports_explain: boolean
  is_default: boolean
  test_metrics: TestMetricsSummary
}

export interface ModelsResponse {
  default: string
  models: ModelInfo[]
}

/* ------------------------------------------------------------------ predict / explain */

export interface Prediction {
  label: string
  index: number
  probability: number
}

export interface ImageInfo {
  width: number
  height: number
  format: string
}

export interface PredictResponse {
  model: string
  predictions: Prediction[]
  low_confidence: boolean
  low_confidence_threshold: number
  inference_ms: number
  image: ImageInfo
  /** `{label: slug}` for linking predictions to `/species/:slug`. */
  slugs: Record<string, string>
}

export type Colormap = 'jet' | 'amber'

export interface ExplainResponse {
  model: string
  class_index: number
  label: string
  probability: number
  predicted: Prediction
  predictions: Prediction[]
  low_confidence: boolean
  /** Added before Phase 5; optional so older backends still type-check. */
  low_confidence_threshold?: number
  method: string
  colormap: Colormap | string
  width: number
  height: number
  image: ImageInfo
  /** Base64 PNG (RGB), heatmap blended over the image. */
  overlay_png: string
  /** Base64 PNG (8-bit grayscale), 255 = strongest activation. */
  heatmap_png: string
  grid: number[][]
  inference_ms: number
  explain_ms: number
  slugs: Record<string, string>
}

/* ------------------------------------------------------------------ metrics / figures */

export interface MetricsSummary {
  test_accuracy: number | null
  test_top5_accuracy: number | null
  best_val_accuracy: number | null
  macro_precision: number | null
  macro_recall: number | null
  macro_f1: number | null
  macro_roc_auc: number | null
  macro_avg_class_accuracy: number | null
  total_params: number | null
  avg_inference_ms_per_image: number | null
  best_epoch: number | null
  epochs: number | null
  batch_size: number | null
  learning_rate: number | null
  optimizer: string | null
  test_samples: number | null
  train_time_minutes: number | null
}

export interface PerClassPrf {
  class: string
  precision?: number
  recall?: number
  f1_score?: number
  support?: number
  [key: string]: unknown
}

export interface ModelMetrics {
  id: string
  display_name: string
  summary: MetricsSummary
  hparams: Record<string, unknown> | null
  per_class_accuracy: Record<string, number> | null
  per_class_prf: PerClassPrf[] | null
  history: Record<string, Array<number | null>> | null
  figures: string[]
  sources: string[]
  raw: Record<string, unknown>
}

export interface MetricsResponse {
  models: Record<string, ModelMetrics>
}

export interface FigureInfo {
  name: string
  url: string
  model: string | null
  size_bytes: number
}

export interface FiguresResponse {
  figures: FigureInfo[]
}

/* ------------------------------------------------------------------ species */

export type AnimalGroup =
  | 'Mammal'
  | 'Bird'
  | 'Reptile'
  | 'Amphibian'
  | 'Fish'
  | 'Insect'
  | 'Arachnid'
  | 'Crustacean'
  | 'Mollusc'
  | 'Other'

export interface SpeciesImage {
  url: string | null
  thumb_url: string | null
  width: number | null
  height: number | null
  artist: string | null
  license: string | null
  license_url: string | null
  source_url: string | null
  provider: string | null
  file: string | null
}

export interface IucnStatus {
  /** null for groups, domestic forms and hybrids (see `label`). */
  code: IucnCode | null
  label: string
  source: string | null
  source_url?: string | null
}

export interface ModelClassStats {
  model: string
  test_accuracy: number | null
  test_images: number | null
  source: string | null
}

export interface SpeciesSummary {
  slug: string
  label: string
  common_name: string
  scientific_name: string | null
  is_group: boolean
  animal_group: AnimalGroup | string | null
  thumb_url: string | null
  iucn_code: IucnCode | null
  iucn_label: string | null
  model_accuracy: number | null
  /** Only with `extended: true`. */
  rank?: string | null
  image?: SpeciesImage | null
  inaturalist_observations?: number | null
  test_images?: number | null
}

export interface SpeciesImagesResponse {
  count: number
  /** slug -> local copies served by the backend (scripts/cache_species_images.py). */
  images: Record<string, { hero?: string | null; card?: string | null }>
}

export interface SpeciesListResponse {
  count: number
  total: number
  species: SpeciesSummary[]
}

export interface SpeciesDetail {
  label: string
  slug: string
  common_name: string
  scientific_name: string | null
  rank: string | null
  is_group: boolean
  domestic: boolean
  rank_note: string | null
  taxonomy: Record<string, string | null>
  animal_group: AnimalGroup | string | null
  summary: string | null
  description: string | null
  wikipedia_title: string | null
  wikipedia_url: string | null
  wikidata_id: string | null
  image: SpeciesImage | null
  iucn_status: IucnStatus
  gbif_taxon_key: number | null
  gbif_taxon: { name?: string; rank?: string; note?: string | null; [key: string]: unknown } | null
  inaturalist_taxon_id: number | null
  inaturalist_taxon: { name?: string; rank?: string; common_name?: string; [key: string]: unknown } | null
  inaturalist_observations: number | null
  model_stats: ModelClassStats | null
  fetched_at: string | null
}

export interface SpeciesQuery {
  q?: string
  group?: AnimalGroup | string
  /** IUCN code, or `NA` for "no species-level status". */
  status?: IucnCode | 'NA'
  /** Adds rank, image attribution, observations and test-image counts to each row. */
  extended?: boolean
}

/* ------------------------------------------------------------------ chat */

export type ChatRole = 'user' | 'assistant'

export interface ChatMessageIn {
  role: ChatRole
  content: string
}

export interface ChatContext {
  species_slug?: string
  label?: string
}

export interface ChatRequest {
  messages: ChatMessageIn[]
  context?: ChatContext
}

export type ChatProvider = 'groq' | 'ollama' | 'fallback' | (string & {})
export type RetrievalMode = 'kb' | 'live' | 'none' | 'unavailable' | (string & {})
export type SourceKind = 'wikipedia' | 'inaturalist' | 'wikidata' | 'kb' | 'project' | (string & {})

export interface ChatSource {
  id: number
  title: string
  url: string | null
  kind: SourceKind
}

export interface ChatSubject {
  name: string
  scientific_name?: string | null
  slug?: string | null
  [key: string]: unknown
}

export interface ChatMetaEvent {
  type: 'meta'
  provider: ChatProvider
  model: string | null
  retrieval: RetrievalMode
  subjects: ChatSubject[]
  sources: ChatSource[]
  skipped: Array<{ provider: string; reason: string }>
}

export interface ChatTokenEvent {
  type: 'token'
  text: string
}

export interface ChatDoneEvent {
  type: 'done'
  provider: ChatProvider
  finish_reason: string
  elapsed_ms: number
}

export interface ChatErrorEvent {
  type: 'error'
  message: string
}

export type ChatEvent = ChatMetaEvent | ChatTokenEvent | ChatDoneEvent | ChatErrorEvent

/* ------------------------------------------------------------------ SSE parsing */

/** One raw Server-Sent Event (`event:` name + joined `data:` lines). */
export interface RawSseEvent {
  event: string
  data: string
}

/**
 * Incremental SSE parser (WHATWG event-stream rules, minus `id`/`retry` handling).
 * Feed it decoded text chunks in any split; it calls `onEvent` for each complete event.
 */
export function createSseParser(onEvent: (event: RawSseEvent) => void) {
  let buffer = ''
  let eventName = ''
  let dataLines: string[] = []

  const dispatch = () => {
    if (dataLines.length > 0) onEvent({ event: eventName || 'message', data: dataLines.join('\n') })
    eventName = ''
    dataLines = []
  }

  const processLine = (line: string) => {
    if (line === '') return dispatch()
    if (line.startsWith(':')) return // comment / keep-alive
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value
    else if (field === 'data') dataLines.push(value)
  }

  return {
    feed(chunk: string) {
      buffer += chunk
      let match: RegExpExecArray | null
      const newline = /\r\n|\r|\n/g
      let start = 0
      while ((match = newline.exec(buffer)) !== null) {
        // A lone trailing \r may be the first half of \r\n: wait for more input.
        if (match[0] === '\r' && match.index === buffer.length - 1) break
        processLine(buffer.slice(start, match.index))
        start = match.index + match[0].length
      }
      buffer = buffer.slice(start)
    },
    /** Call at end of stream: dispatches a final event not followed by a blank line. */
    flush() {
      if (buffer !== '') {
        processLine(buffer)
        buffer = ''
      }
      dispatch()
    },
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Convert a raw SSE event from `/api/chat` into a typed ChatEvent; unknown/malformed → null. */
export function parseChatEvent(raw: RawSseEvent): ChatEvent | null {
  let data: unknown
  try {
    data = JSON.parse(raw.data)
  } catch {
    return null
  }
  if (!isRecord(data)) return null
  switch (raw.event) {
    case 'meta':
      return {
        type: 'meta',
        provider: String(data.provider ?? 'fallback'),
        model: typeof data.model === 'string' ? data.model : null,
        retrieval: String(data.retrieval ?? 'none'),
        subjects: Array.isArray(data.subjects) ? (data.subjects as ChatSubject[]) : [],
        sources: Array.isArray(data.sources) ? (data.sources as ChatSource[]) : [],
        skipped: Array.isArray(data.skipped) ? (data.skipped as ChatMetaEvent['skipped']) : [],
      }
    case 'token':
      return typeof data.text === 'string' ? { type: 'token', text: data.text } : null
    case 'done':
      return {
        type: 'done',
        provider: String(data.provider ?? ''),
        finish_reason: String(data.finish_reason ?? 'stop'),
        elapsed_ms: typeof data.elapsed_ms === 'number' ? data.elapsed_ms : 0,
      }
    case 'error':
      return { type: 'error', message: typeof data.message === 'string' ? data.message : 'Unknown error' }
    default:
      return null
  }
}

/* ------------------------------------------------------------------ fetch helpers */

async function readError(res: Response): Promise<ApiError> {
  let detail = res.statusText
  try {
    const body: unknown = await res.json()
    if (isRecord(body) && typeof body.detail === 'string') detail = body.detail
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, detail)
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (!res.ok) throw await readError(res)
  return (await res.json()) as T
}

function imageForm(file: Blob, fields: Record<string, string | number | undefined>): FormData {
  const form = new FormData()
  form.append('file', file, file instanceof File ? file.name : 'upload')
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, String(v))
  return form
}

export const api = {
  health: (signal?: AbortSignal) => getJson<HealthResponse>('/api/health', { signal }),

  models: (signal?: AbortSignal) => getJson<ModelsResponse>('/api/models', { signal }),

  species: (query: SpeciesQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, String(v))
    const qs = params.toString()
    return getJson<SpeciesListResponse>(`/api/species${qs ? `?${qs}` : ''}`, { signal })
  },

  speciesDetail: (slug: string, signal?: AbortSignal) =>
    getJson<SpeciesDetail>(`/api/species/${encodeURIComponent(slug)}`, { signal }),

  speciesImages: (signal?: AbortSignal) => getJson<SpeciesImagesResponse>('/api/species-images', { signal }),

  metrics: (signal?: AbortSignal) => getJson<MetricsResponse>('/api/metrics', { signal }),

  figures: (signal?: AbortSignal) => getJson<FiguresResponse>('/api/figures', { signal }),

  figureUrl: (name: string) => `${API_BASE}/api/figures/${encodeURIComponent(name)}`,

  predict: (file: Blob, opts: { model?: string; topK?: number; signal?: AbortSignal } = {}) =>
    getJson<PredictResponse>('/api/predict', {
      method: 'POST',
      body: imageForm(file, { model: opts.model, top_k: opts.topK }),
      signal: opts.signal,
    }),

  explain: (
    file: Blob,
    opts: { model?: string; classIndex?: number; colormap?: Colormap; signal?: AbortSignal } = {},
  ) =>
    getJson<ExplainResponse>('/api/explain', {
      method: 'POST',
      // `amber` matches the site palette (review log, Phase 1 follow-up).
      body: imageForm(file, {
        model: opts.model,
        class_index: opts.classIndex,
        colormap: opts.colormap ?? 'amber',
      }),
      signal: opts.signal,
    }),
}

/**
 * Stream `/api/chat`. Yields typed events in order (`meta`, `token`*, `done` | `error`).
 * Abort with `signal` to stop generation.
 */
export async function* streamChat(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(request),
    signal,
  })
  if (!res.ok) throw await readError(res)
  if (!res.body) throw new ApiError(res.status, 'Streaming is not supported by this browser.')

  const queue: ChatEvent[] = []
  const parser = createSseParser((raw) => {
    const ev = parseChatEvent(raw)
    if (ev) queue.push(ev)
  })
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parser.feed(value)
      while (queue.length) yield queue.shift() as ChatEvent
    }
    parser.flush()
    while (queue.length) yield queue.shift() as ChatEvent
  } finally {
    reader.releaseLock()
  }
}

/** Data URL for a base64 PNG returned by `/api/explain`. */
export function pngDataUrl(base64: string): string {
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
}
