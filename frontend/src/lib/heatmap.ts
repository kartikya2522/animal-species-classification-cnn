/**
 * Colourise an 8-bit grayscale CAM (heatmap_png from /api/explain) into a
 * transparent RGBA layer in the site palette: weak activations vanish, strong
 * ones glow ochre → pale gold. Runs once per heatmap on a canvas.
 */

type Stop = [t: number, r: number, g: number, b: number, a: number]

const STOPS: Stop[] = [
  [0.0, 15, 31, 23, 0],
  [0.25, 47, 74, 58, 0.18],
  [0.5, 168, 112, 38, 0.55],
  [0.75, 214, 160, 74, 0.78],
  [1.0, 252, 232, 184, 0.9],
]

function buildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let k = 0
    while (k < STOPS.length - 2 && t > (STOPS[k + 1] as Stop)[0]) k++
    const a = STOPS[k] as Stop
    const b = STOPS[k + 1] as Stop
    const f = (t - a[0]) / (b[0] - a[0])
    lut[i * 4] = a[1] + (b[1] - a[1]) * f
    lut[i * 4 + 1] = a[2] + (b[2] - a[2]) * f
    lut[i * 4 + 2] = a[3] + (b[3] - a[3]) * f
    lut[i * 4 + 3] = (a[4] + (b[4] - a[4]) * f) * 255
  }
  return lut
}

let lutCache: Uint8ClampedArray | null = null

export async function colorizeHeatmap(src: string): Promise<string> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const lut = (lutCache ??= buildLut())
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const v = (px[i] as number) * 4
    px[i] = lut[v] as number
    px[i + 1] = lut[v + 1] as number
    px[i + 2] = lut[v + 2] as number
    px[i + 3] = lut[v + 3] as number
  }
  ctx.putImageData(data, 0, 0)
  return canvas.toDataURL('image/png')
}

/** CSS gradient matching the ramp, for the legend. */
export const HEATMAP_LEGEND_GRADIENT =
  'linear-gradient(90deg, rgba(47,74,58,0.15) 0%, rgba(168,112,38,0.6) 45%, rgb(214,160,74) 75%, rgb(252,232,184) 100%)'
