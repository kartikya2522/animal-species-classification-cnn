/**
 * Wikimedia Commons thumbnails. KB image URLs point at full-resolution originals
 * (often 4000+ px); request a standard thumbnail width instead.
 */
const STANDARD_WIDTHS = [330, 500, 960, 1280, 1920] as const

export function commonsThumb(
  url: string | null | undefined,
  width: number,
  originalWidth?: number | null,
): string | null {
  if (!url) return null
  const m = url.match(
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/,
  )
  if (!m) return url
  const target: number = STANDARD_WIDTHS.find((w) => w >= width) ?? 1920
  if (originalWidth && originalWidth <= target) return url
  const [, a, ab, file] = m
  const suffix = /\.(tiff?|svg)$/i.test(file ?? '') ? '.png' : ''
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${file}/${target}px-${file}${suffix}`
}
