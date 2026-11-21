/** Decode an uploaded image to RGBA pixels, EXIF orientation applied. */
export interface DecodedImage {
  /** Size of `data` (equals the natural size unless the photo was pre-scaled, see `planDecode`). */
  width: number
  height: number
  /** RGBA, row-major. */
  data: Uint8ClampedArray
  /** Size of the photo as uploaded (after EXIF orientation). */
  naturalWidth: number
  naturalHeight: number
}

/** Same decompression-bomb guard as the backend (WILDLENS_MAX_IMAGE_PIXELS). */
export const MAX_IMAGE_PIXELS = 50_000_000
/**
 * Photos above this are scaled down by the browser before their pixels are read, so a 50 MP
 * upload does not need a 200 MB RGBA buffer. Up to this size the pixels go unchanged into the
 * Pillow-equivalent bilinear resize to 224×224, so browser and server results are identical;
 * above it they can differ slightly (the model input is still produced by the same resize).
 */
export const DOWNSCALE_ABOVE_PIXELS = 24_000_000

export type DecodePlan =
  | { action: 'reject'; message: string }
  | { action: 'full'; width: number; height: number }
  | { action: 'downscale'; width: number; height: number }

/** What to do with a decoded bitmap of `width`×`height` (pure; exported for tests). */
export function planDecode(width: number, height: number): DecodePlan {
  const pixels = width * height
  if (!Number.isFinite(pixels) || width < 1 || height < 1)
    return { action: 'reject', message: 'This file could not be decoded as an image.' }
  if (pixels > MAX_IMAGE_PIXELS)
    return {
      action: 'reject',
      message: `This image is too large (${(pixels / 1e6).toFixed(0)} megapixels; the limit is ${MAX_IMAGE_PIXELS / 1e6} MP). Resize or crop it and try again.`,
    }
  if (pixels <= DOWNSCALE_ABOVE_PIXELS) return { action: 'full', width, height }
  const scale = Math.sqrt(DOWNSCALE_ABOVE_PIXELS / pixels)
  return {
    action: 'downscale',
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

export async function decodeImage(file: Blob): Promise<DecodedImage> {
  let bitmap: ImageBitmap
  // No colour management or premultiplication: keep the file's sRGB values as Pillow does.
  const opts: ImageBitmapOptions = {
    imageOrientation: 'from-image',
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  }
  try {
    bitmap = await createImageBitmap(file, opts)
  } catch {
    throw new Error('This file could not be decoded as an image. Use a JPEG, PNG or WebP photograph.')
  }
  const naturalWidth = bitmap.width
  const naturalHeight = bitmap.height
  const plan = planDecode(naturalWidth, naturalHeight)
  if (plan.action === 'reject') {
    bitmap.close()
    throw new Error(plan.message)
  }
  if (plan.action === 'downscale') {
    try {
      const scaled = await createImageBitmap(bitmap, {
        ...opts,
        imageOrientation: 'none', // already applied to `bitmap`
        resizeWidth: plan.width,
        resizeHeight: plan.height,
        resizeQuality: 'high',
      })
      bitmap.close()
      bitmap = scaled
    } catch {
      bitmap.close()
      throw new Error('This image is too large to process in the browser. Resize it and try again.')
    }
  }
  const { width, height } = bitmap
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const data = ctx.getImageData(0, 0, width, height).data
  return { width, height, data, naturalWidth, naturalHeight }
}

/** Grayscale uint8 map -> PNG data URL (R = G = B = value, opaque), like heatmap_png. */
export async function grayscalePng(
  values: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string> {
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
  const img = ctx.createImageData(width, height)
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}
