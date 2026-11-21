import { describe, expect, it } from 'vitest'

import fixture from './__fixtures__/backend.json'
import {
  camHeatmap,
  computeCam,
  fitWithin,
  normalize01,
  preprocessPixels,
  resizeBilinear,
  softmax,
  topK,
} from './math'

/** Fixtures are produced by the backend's Python code (scripts/make_inference_fixture.py). */
describe('resizeBilinear matches Pillow BILINEAR', () => {
  for (const c of fixture.resize) {
    it(`${c.sw}×${c.sh} → ${c.dw}×${c.dh}`, () => {
      const out = resizeBilinear(c.src, c.sw, c.sh, c.dw, c.dh, 3)
      expect(out.length).toBe(c.out.length)
      expect(Array.from(out)).toEqual(c.out)
    })
  }

  it('handles RGBA input by stride', () => {
    const c = fixture.resize[0]!
    const rgba = new Uint8ClampedArray((c.src.length / 3) * 4)
    for (let i = 0, j = 0; i < c.src.length; i += 3, j += 4) {
      rgba[j] = c.src[i]!
      rgba[j + 1] = c.src[i + 1]!
      rgba[j + 2] = c.src[i + 2]!
      rgba[j + 3] = 255
    }
    const out = resizeBilinear(rgba, c.sw, c.sh, c.dw, c.dh, 4)
    const rgb = Array.from(out).filter((_, i) => i % 4 !== 3)
    expect(rgb).toEqual(c.out)
  })
})

describe('preprocessPixels matches backend preprocess_image', () => {
  it('resize + /255 + dataset mean/std, CHW', () => {
    const p = fixture.preprocess
    const out = preprocessPixels(p.src, p.sw, p.sh, p.size, p.mean, p.std, 3)
    expect(out.length).toBe(p.out.length)
    let maxDiff = 0
    out.forEach((v, i) => (maxDiff = Math.max(maxDiff, Math.abs(v - p.out[i]!))))
    expect(maxDiff).toBeLessThan(1e-6)
  })
})

describe('softmax and top-k', () => {
  it('match the backend', () => {
    const s = fixture.softmax
    const probs = softmax(s.logits)
    probs.forEach((v, i) => expect(v).toBeCloseTo(s.probs[i]!, 12))
    expect(topK(probs, 5)).toEqual(s.top5)
  })

  it('top-k is stable for ties and clamps k', () => {
    expect(topK([0.2, 0.5, 0.5, 0.1], 3)).toEqual([1, 2, 0])
    expect(topK([1, 2], 10)).toEqual([1, 0])
    expect(topK([1, 2], 0)).toEqual([1])
  })
})

describe('CAM', () => {
  const c = fixture.cam
  it('grid = normalise(ReLU(W·A))', () => {
    const grid = normalize01(computeCam(c.features, c.weight, c.class_index, c.K, 49))
    grid.forEach((v, i) => expect(v).toBeCloseTo(c.grid[i]!, 5))
  })

  it('fitWithin caps the longest side like the backend', () => {
    expect(fitWithin(1600, 1200, 32)).toEqual(c.size)
    expect(fitWithin(300, 200, 1024)).toEqual([300, 200])
    expect(fitWithin(4000, 3000, 1024)).toEqual([1024, 768])
  })

  it('upsampled heatmap matches the backend (uint8, ±1)', () => {
    const r = camHeatmap(c.features, c.weight, c.class_index, {
      K: c.K,
      gridH: 7,
      gridW: 7,
      imageWidth: c.image_size[0]!,
      imageHeight: c.image_size[1]!,
      maxSide: c.max_side,
    })
    expect([r.width, r.height]).toEqual(c.size)
    let maxDiff = 0
    r.heat.forEach((v, i) => (maxDiff = Math.max(maxDiff, Math.abs(v - c.heat_u8[i]!))))
    expect(maxDiff).toBeLessThanOrEqual(1)
  })
})
