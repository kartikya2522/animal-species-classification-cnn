/**
 * Download a model file once, with progress, and keep it in Cache Storage so later
 * visits (and reloads) start instantly. Falls back to a plain fetch where Cache Storage
 * is unavailable (non-secure origins, some private windows).
 *
 * Entries are keyed by URL + the SHA-256 from `models/registry.json`, so a re-exported model
 * (new hash) is downloaded again instead of reusing a stale copy; older entries for the same
 * URL are removed when the new one is stored. Downloads are rejected if the server returned a
 * web page (e.g. an SPA fallback for a missing file) and, when the hash is known, if the bytes
 * do not match it.
 */
import type { LoadProgress } from '@/lib/inference/types'

export const MODEL_CACHE_NAME = 'wildlens-models-v2'
const OLD_CACHES = ['wildlens-models-v1']
const KEY_PARAM = 'wildlens-sha256'
/** Real ONNX models are megabytes; anything this small is an error page, not a model. */
const MIN_MODEL_BYTES = 64 * 1024

export interface FetchModelOptions {
  /** Expected SHA-256 (hex) from the registry; verified when Web Crypto is available. */
  sha256?: string | null
  onProgress?: (p: LoadProgress) => void
  signal?: AbortSignal
  /** Skip the cache lookup (still stores the fresh download). */
  bypassCache?: boolean
}

export interface FetchedModel {
  bytes: Uint8Array
  fromCache: boolean
}

async function openCache(): Promise<Cache | null> {
  try {
    if (!('caches' in globalThis)) return null
    for (const name of OLD_CACHES) void caches.delete(name).catch(() => false)
    return await caches.open(MODEL_CACHE_NAME)
  } catch {
    return null
  }
}

function absoluteUrl(url: string): string {
  return new URL(url, globalThis.location?.href).toString()
}

/** Cache key for a model URL + hash (the hash goes in a query parameter: Cache Storage ignores fragments). */
export function cacheKey(url: string, sha256?: string | null): string {
  const u = new URL(absoluteUrl(url))
  if (sha256) u.searchParams.set(KEY_PARAM, sha256.toLowerCase())
  return u.toString()
}

function baseOfKey(key: string): string {
  const u = new URL(key)
  u.searchParams.delete(KEY_PARAM)
  return u.toString()
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const digest = await subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function looksLikeWebPage(bytes: Uint8Array, contentType: string | null): boolean {
  if (contentType && /text\/html|application\/xhtml|application\/json/i.test(contentType)) return true
  // "<!doctype html>", "<html", "<?xml" ... after optional whitespace / BOM
  for (const b of bytes.subarray(0, 64)) {
    if (b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0xef || b === 0xbb || b === 0xbf)
      continue
    return b === 0x3c /* < */ || b === 0x7b /* { */
  }
  return false
}

/** Throws a clear error unless `bytes` plausibly is the expected model file. */
export async function validateModelBytes(
  bytes: Uint8Array,
  contentType: string | null,
  url: string,
  sha256?: string | null,
): Promise<void> {
  if (looksLikeWebPage(bytes, contentType))
    throw new Error(
      `The model URL ${url} returned a web page instead of the model file. Check that the file exists ` +
        '(scripts/download_models.sh) or that VITE_MODEL_URL is correct.',
    )
  if (bytes.byteLength < MIN_MODEL_BYTES)
    throw new Error(`The file at ${url} is too small (${bytes.byteLength} bytes) to be the model.`)
  if (sha256) {
    const have = await sha256Hex(bytes)
    if (have && have !== sha256.toLowerCase())
      throw new Error(
        `The model downloaded from ${url} does not match the expected SHA-256 in models/registry.json ` +
          '(re-exported or corrupted file). Please retry or update the registry.',
      )
  }
}

export async function fetchModel(url: string, opts: FetchModelOptions = {}): Promise<FetchedModel> {
  const { sha256, onProgress, signal, bypassCache } = opts
  const cache = await openCache()
  const absolute = absoluteUrl(url)
  const key = cacheKey(url, sha256)
  if (!bypassCache) {
    const hit = await cache?.match(key).catch(() => undefined)
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer())
      onProgress?.({ phase: 'model', loaded: bytes.byteLength, total: bytes.byteLength, fromCache: true })
      return { bytes, fromCache: true }
    }
  }

  const res = await fetch(absolute, { signal, cache: bypassCache ? 'reload' : 'default' })
  if (!res.ok) throw new Error(`Could not download the model (${res.status} ${res.statusText}) from ${url}.`)
  const contentType = res.headers.get('content-type')
  if (contentType && /text\/html/i.test(contentType)) {
    await res.body?.cancel().catch(() => undefined)
    throw new Error(
      `The model URL ${url} returned a web page instead of the model file. Check that the file exists ` +
        '(scripts/download_models.sh) or that VITE_MODEL_URL is correct.',
    )
  }
  const total = Number(res.headers.get('content-length')) || undefined
  let bytes: Uint8Array
  if (res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onProgress?.({ phase: 'model', loaded, total })
    }
    bytes = new Uint8Array(loaded)
    let offset = 0
    for (const c of chunks) {
      bytes.set(c, offset)
      offset += c.byteLength
    }
  } else {
    bytes = new Uint8Array(await res.arrayBuffer())
  }
  if (total && bytes.byteLength !== total) throw new Error('The model download was incomplete. Please retry.')
  await validateModelBytes(bytes, contentType, url, sha256)
  if (cache) {
    try {
      // Drop entries for the same URL with another (stale) hash, then store this one.
      for (const req of await cache.keys())
        if (req.url !== key && baseOfKey(req.url) === absolute) await cache.delete(req)
      await cache.put(
        key,
        new Response(bytes as Uint8Array<ArrayBuffer>, {
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) },
        }),
      )
    } catch {
      /* quota exceeded or storage disabled: still usable for this session */
    }
  }
  return { bytes, fromCache: false }
}

/** Remove the cached copy of a model (e.g. when ONNX Runtime cannot load it). */
export async function evictModel(url: string, sha256?: string | null): Promise<void> {
  const cache = await openCache()
  await cache?.delete(cacheKey(url, sha256)).catch(() => false)
}

/** True if the model at `url` (with this hash) is already in Cache Storage. */
export async function isModelCached(url: string, sha256?: string | null): Promise<boolean> {
  const cache = await openCache()
  if (!cache) return false
  return Boolean(await cache.match(cacheKey(url, sha256)).catch(() => undefined))
}
