import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cacheKey,
  evictModel,
  fetchModel,
  isModelCached,
  MODEL_CACHE_NAME,
} from '@/lib/inference/model-cache'

/** Minimal in-memory Cache Storage. */
class MemCache {
  store = new Map<string, { body: Uint8Array; headers: Record<string, string> }>()
  async match(key: string) {
    const v = this.store.get(String(key))
    return v ? new Response(v.body as Uint8Array<ArrayBuffer>, { headers: v.headers }) : undefined
  }
  async put(key: string, res: Response) {
    this.store.set(String(key), { body: new Uint8Array(await res.arrayBuffer()), headers: {} })
  }
  async delete(key: string | Request) {
    return this.store.delete(typeof key === 'string' ? key : key.url)
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }) as Request)
  }
}

const MODEL = new Uint8Array(100 * 1024).map((_, i) => (i * 7) % 251)
MODEL[0] = 0x08 // protobuf field 1 (ir_version), like a real .onnx

async function sha(bytes: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}

let mem: MemCache
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  mem = new MemCache()
  vi.stubGlobal('caches', {
    open: vi.fn(async (name: string) => {
      expect(name).toBe(MODEL_CACHE_NAME)
      return mem
    }),
    delete: vi.fn(async () => true),
  })
  fetchMock = vi.fn(
    async () =>
      new Response(MODEL as Uint8Array<ArrayBuffer>, {
        headers: { 'content-type': 'application/octet-stream' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('model cache', () => {
  it('keys the cache by URL + sha256, so a new hash downloads again and replaces the stale copy', async () => {
    const good = await sha(MODEL)
    const first = await fetchModel('/models/efficientnetv2_s.fp16.onnx', { sha256: good })
    expect(first.fromCache).toBe(false)
    const again = await fetchModel('/models/efficientnetv2_s.fp16.onnx', { sha256: good })
    expect(again.fromCache).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await isModelCached('/models/efficientnetv2_s.fp16.onnx', good)).toBe(true)
    expect(cacheKey('/models/efficientnetv2_s.fp16.onnx', good)).toContain(`wildlens-sha256=${good}`)

    // Re-exported model: the registry hash changes -> not a cache hit; the old entry is removed.
    const NEW = MODEL.slice()
    NEW[10] = 1
    fetchMock.mockImplementation(async () => new Response(NEW as Uint8Array<ArrayBuffer>))
    const newSha = await sha(NEW)
    const re = await fetchModel('/models/efficientnetv2_s.fp16.onnx', { sha256: newSha })
    expect(re.fromCache).toBe(false)
    expect(await isModelCached('/models/efficientnetv2_s.fp16.onnx', good)).toBe(false)
    expect(mem.store.size).toBe(1)
  })

  it('rejects an HTML page served instead of the model (SPA fallback)', async () => {
    fetchMock.mockImplementation(
      async () => new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } }),
    )
    await expect(fetchModel('/models/missing.onnx')).rejects.toThrow(/returned a web page/)
    fetchMock.mockImplementation(async () => new Response('<!doctype html>' + ' '.repeat(100_000)))
    await expect(fetchModel('/models/missing.onnx')).rejects.toThrow(/returned a web page/)
    expect(mem.store.size).toBe(0)
  })

  it('rejects tiny files and hash mismatches without caching them', async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([8, 1, 2])))
    await expect(fetchModel('/models/x.onnx')).rejects.toThrow(/too small/)
    fetchMock.mockImplementation(async () => new Response(MODEL as Uint8Array<ArrayBuffer>))
    await expect(fetchModel('/models/x.onnx', { sha256: 'f'.repeat(64) })).rejects.toThrow(/SHA-256/)
    expect(mem.store.size).toBe(0)
  })

  it('evicts a cached model and can bypass the cache', async () => {
    const good = await sha(MODEL)
    await fetchModel('/models/m.onnx', { sha256: good })
    await evictModel('/models/m.onnx', good)
    expect(await isModelCached('/models/m.onnx', good)).toBe(false)
    await fetchModel('/models/m.onnx', { sha256: good })
    const fresh = await fetchModel('/models/m.onnx', { sha256: good, bypassCache: true })
    expect(fresh.fromCache).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
