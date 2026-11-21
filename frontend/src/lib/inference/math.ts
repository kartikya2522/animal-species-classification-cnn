/**
 * Pure inference maths shared by the browser model path (and unit-tested against
 * fixtures generated from the backend's own Python code, see
 * scripts/make_inference_fixture.py):
 *
 *  - `resizeBilinear`  — Pillow's `Image.resize(..., BILINEAR)` for 8-bit RGB, ported
 *    from Pillow's Resample.c (antialiased "triangle" filter whose support grows with the
 *    downscale factor, 22-bit fixed-point coefficients, horizontal pass then vertical pass,
 *    each rounded to uint8). Bit-identical to the backend on the fixtures.
 *  - `toTensor`        — /255 then (x - mean) / std, CHW float32 (preprocessing.py).
 *  - `softmax`, `topK` — float64 softmax, stable descending sort (inference.py).
 *  - CAM               — ReLU(Σ_k W[c,k]·A_k) on the 7×7 grid, normalise, bilinear upsample
 *    (Pillow's float path), normalise again, round to uint8 (services/cam.py).
 */

const PRECISION_BITS = 32 - 8 - 2
const ONE = 2 ** PRECISION_BITS

interface Coeffs {
  ksize: number
  bounds: Int32Array // [xmin, count] per output pixel
  kk: Float64Array // ksize weights per output pixel (normalised to sum 1)
}

/** Pillow precompute_coeffs() with the bilinear (triangle, support 1) filter. */
function precomputeCoeffs(inSize: number, outSize: number): Coeffs {
  const scale = inSize / outSize
  const filterscale = Math.max(1, scale)
  const support = 1 * filterscale
  const ksize = Math.ceil(support) * 2 + 1
  const bounds = new Int32Array(outSize * 2)
  const kk = new Float64Array(outSize * ksize)
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale
    const ss = 1 / filterscale
    let xmin = Math.trunc(center - support + 0.5)
    if (xmin < 0) xmin = 0
    let xmax = Math.trunc(center + support + 0.5)
    if (xmax > inSize) xmax = inSize
    xmax -= xmin
    let ww = 0
    const base = xx * ksize
    for (let x = 0; x < xmax; x++) {
      let t = Math.abs((x + xmin - center + 0.5) * ss)
      t = t < 1 ? 1 - t : 0
      kk[base + x] = t
      ww += t
    }
    if (ww !== 0) for (let x = 0; x < xmax; x++) kk[base + x] = (kk[base + x] as number) / ww
    bounds[xx * 2] = xmin
    bounds[xx * 2 + 1] = xmax
  }
  return { ksize, bounds, kk }
}

/** normalize_coeffs_8bpc(): double weights -> 22-bit fixed point, rounded half away from zero. */
function fixedPoint(kk: Float64Array): Int32Array {
  const out = new Int32Array(kk.length)
  for (let i = 0; i < kk.length; i++) {
    const v = kk[i] as number
    out[i] = v < 0 ? Math.trunc(-0.5 + v * ONE) : Math.trunc(0.5 + v * ONE)
  }
  return out
}

function clip8(v: number): number {
  if (v >= ONE * 256) return 255
  if (v <= 0) return 0
  return Math.floor(v / ONE)
}

/**
 * Resize interleaved 8-bit pixels (`channels` per pixel, e.g. 3 for RGB or 4 for RGBA)
 * exactly like Pillow's BILINEAR resize. Returns a new buffer with the same channel count.
 */
export function resizeBilinear(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  channels = 3,
): Uint8ClampedArray {
  const needH = sw !== dw
  const needV = sh !== dh
  let cur: ArrayLike<number> = src
  let cw = sw
  if (needH) {
    const { ksize, bounds, kk } = precomputeCoeffs(sw, dw)
    const k = fixedPoint(kk)
    const out = new Uint8ClampedArray(dw * sh * channels)
    for (let y = 0; y < sh; y++) {
      const row = y * sw * channels
      for (let xx = 0; xx < dw; xx++) {
        const xmin = bounds[xx * 2] as number
        const n = bounds[xx * 2 + 1] as number
        const kb = xx * ksize
        for (let c = 0; c < channels; c++) {
          let ss = ONE / 2
          for (let x = 0; x < n; x++)
            ss += (src[row + (x + xmin) * channels + c] as number) * (k[kb + x] as number)
          out[(y * dw + xx) * channels + c] = clip8(ss)
        }
      }
    }
    cur = out
    cw = dw
  }
  if (needV) {
    const { ksize, bounds, kk } = precomputeCoeffs(sh, dh)
    const k = fixedPoint(kk)
    const out = new Uint8ClampedArray(cw * dh * channels)
    for (let yy = 0; yy < dh; yy++) {
      const ymin = bounds[yy * 2] as number
      const n = bounds[yy * 2 + 1] as number
      const kb = yy * ksize
      for (let x = 0; x < cw; x++) {
        for (let c = 0; c < channels; c++) {
          let ss = ONE / 2
          for (let y = 0; y < n; y++)
            ss += (cur[((y + ymin) * cw + x) * channels + c] as number) * (k[kb + y] as number)
          out[(yy * cw + x) * channels + c] = clip8(ss)
        }
      }
    }
    cur = out
  }
  if (!needH && !needV) return Uint8ClampedArray.from(src)
  return cur as Uint8ClampedArray
}

/** Interleaved RGB(A) uint8 (already `size`×`size`) -> CHW float32, scaled and normalised. */
export function toTensor(
  pixels: ArrayLike<number>,
  size: number,
  mean: readonly number[],
  std: readonly number[],
  channels = 3,
): Float32Array {
  const plane = size * size
  const out = new Float32Array(3 * plane)
  // Mirror NumPy's float32 arithmetic: (float32(v) / 255) then (x - mean) / std in float32.
  const m = Float32Array.from(mean)
  const s = Float32Array.from(std)
  const f = new Float32Array(1)
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      f[0] = (pixels[i * channels + c] as number) / 255
      f[0] = (f[0] as number) - (m[c] as number)
      f[0] = (f[0] as number) / (s[c] as number)
      out[c * plane + i] = f[0] as number
    }
  }
  return out
}

/** Pillow-equivalent preprocessing: RGB(A) pixels of any size -> (3, size, size) tensor. */
export function preprocessPixels(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  size: number,
  mean: readonly number[],
  std: readonly number[],
  channels = 3,
): Float32Array {
  const resized =
    width === size && height === size ? pixels : resizeBilinear(pixels, width, height, size, size, channels)
  return toTensor(resized, size, mean, std, channels)
}

/* ------------------------------------------------------------------ softmax / top-k */

export function softmax(logits: ArrayLike<number>): Float64Array {
  let max = -Infinity
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i] as number)
  const out = new Float64Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp((logits[i] as number) - max)
    out[i] = e
    sum += e
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / sum
  return out
}

/** Indices of the k largest values, descending; ties resolved by lower index (stable). */
export function topK(values: ArrayLike<number>, k: number): number[] {
  const idx = Array.from({ length: values.length }, (_, i) => i)
  idx.sort((a, b) => (values[b] as number) - (values[a] as number) || a - b)
  return idx.slice(0, Math.max(1, Math.min(k, values.length)))
}

/* ------------------------------------------------------------------ CAM */

/** ReLU(Σ_k W[c,k]·A_k): features (K×h×w, row-major), weight (C×K) -> (h×w). */
export function computeCam(
  features: ArrayLike<number>,
  weight: ArrayLike<number>,
  classIndex: number,
  K: number,
  hw: number,
): Float32Array {
  const out = new Float64Array(hw)
  const wb = classIndex * K
  for (let k = 0; k < K; k++) {
    const wk = weight[wb + k] as number
    if (wk === 0) continue
    const fb = k * hw
    for (let i = 0; i < hw; i++) out[i] = (out[i] as number) + wk * (features[fb + i] as number)
  }
  const res = new Float32Array(hw)
  for (let i = 0; i < hw; i++) res[i] = Math.max(0, out[i] as number)
  return res
}

/** Min-max normalise to [0, 1]; a flat map becomes all zeros. */
export function normalize01(a: ArrayLike<number>): Float32Array {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < a.length; i++) {
    lo = Math.min(lo, a[i] as number)
    hi = Math.max(hi, a[i] as number)
  }
  const out = new Float32Array(a.length)
  if (hi - lo <= 1e-12) return out
  for (let i = 0; i < a.length; i++) out[i] = ((a[i] as number) - lo) / (hi - lo)
  return out
}

/** Pillow's float ('F' mode) bilinear resize of a single-channel map, clipped to [0, 1]. */
export function upsampleFloat(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  const h = precomputeCoeffs(sw, dw)
  const tmp = new Float32Array(dw * sh)
  for (let y = 0; y < sh; y++) {
    for (let xx = 0; xx < dw; xx++) {
      const xmin = h.bounds[xx * 2] as number
      const n = h.bounds[xx * 2 + 1] as number
      let ss = 0
      for (let x = 0; x < n; x++)
        ss += (src[y * sw + x + xmin] as number) * (h.kk[xx * h.ksize + x] as number)
      tmp[y * dw + xx] = ss
    }
  }
  const v = precomputeCoeffs(sh, dh)
  const out = new Float32Array(dw * dh)
  for (let yy = 0; yy < dh; yy++) {
    const ymin = v.bounds[yy * 2] as number
    const n = v.bounds[yy * 2 + 1] as number
    for (let x = 0; x < dw; x++) {
      let ss = 0
      for (let y = 0; y < n; y++)
        ss += (tmp[(y + ymin) * dw + x] as number) * (v.kk[yy * v.ksize + y] as number)
      out[yy * dw + x] = Math.min(1, Math.max(0, ss))
    }
  }
  return out
}

/** services/cam.py fit_within(): scale so the longest side is at most `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number): [number, number] {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return [Math.max(1, pyRound(width * scale)), Math.max(1, pyRound(height * scale))]
}

/** Python's round(): half to even. */
function pyRound(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

export interface CamResult {
  /** Normalised 7×7 grid (row-major). */
  grid: Float32Array
  width: number
  height: number
  /** Heatmap at `width`×`height`, uint8 (255 = strongest). */
  heat: Uint8ClampedArray
}

/** Full server-equivalent CAM: grid -> upsample to the (capped) image size -> uint8. */
export function camHeatmap(
  features: ArrayLike<number>,
  weight: ArrayLike<number>,
  classIndex: number,
  opts: { K: number; gridH: number; gridW: number; imageWidth: number; imageHeight: number; maxSide: number },
): CamResult {
  const hw = opts.gridH * opts.gridW
  const grid = normalize01(computeCam(features, weight, classIndex, opts.K, hw))
  const [width, height] = fitWithin(opts.imageWidth, opts.imageHeight, opts.maxSide)
  const heat01 = normalize01(upsampleFloat(grid, opts.gridW, opts.gridH, width, height))
  const heat = new Uint8ClampedArray(heat01.length)
  for (let i = 0; i < heat01.length; i++) heat[i] = roundHalfEven((heat01[i] as number) * 255)
  return { grid, width, height, heat }
}

/** NumPy's rint(): round half to even. */
function roundHalfEven(x: number): number {
  const r = Math.round(x)
  return x - Math.floor(x) === 0.5 && r % 2 !== 0 ? r - 1 : r
}
