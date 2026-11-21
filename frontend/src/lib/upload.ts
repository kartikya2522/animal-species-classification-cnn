import { formatBytes } from '@/lib/format'

/** Mirrors the backend upload rules (JPEG/PNG/WebP, 10 MB). */
export const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

export function validateImageFile(
  file: File,
  accept: readonly string[] = DEFAULT_ACCEPT,
  maxBytes: number = DEFAULT_MAX_BYTES,
): string | null {
  if (!accept.includes(file.type)) {
    return `“${file.name}” is not a supported image. Use a JPEG, PNG or WebP photograph.`
  }
  if (file.size > maxBytes) {
    return `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`
  }
  if (file.size === 0) return `“${file.name}” is empty.`
  return null
}
