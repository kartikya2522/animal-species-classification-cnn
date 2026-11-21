/**
 * Only `http:` / `https:` URLs from data (knowledge base, chat sources, Markdown) are rendered as
 * links; anything else (`javascript:`, `data:`, relative junk) is shown as plain text instead.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}
