/**
 * Context handoff into the Field Guide (/ask) from Identify and species profiles.
 * Encoded in the URL (`/ask?species=<slug>&name=<common name>`) so it survives reloads
 * and can be linked; the Field Guide pre-fills a first question and sends the slug as
 * chat `context` with every request.
 */

export interface AskHandoff {
  slug: string
  name: string
  /** `identify` adds "the photo I identified" framing to the suggested question. */
  from?: 'identify' | 'profile'
  /** Identify only: top-1 probability (0–1), shown in the suggested question. */
  probability?: number
  /** Identify only: the prediction was below the low-confidence threshold. */
  lowConfidence?: boolean
}

export function askLink(h: AskHandoff): string {
  const p = new URLSearchParams({ species: h.slug, name: h.name })
  if (h.from) p.set('from', h.from)
  if (h.probability != null && Number.isFinite(h.probability))
    p.set('p', String(Math.round(Math.min(1, Math.max(0, h.probability)) * 100)))
  if (h.lowConfidence) p.set('low', '1')
  return `/ask?${p.toString()}`
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function parseHandoff(search: string): AskHandoff | null {
  const p = new URLSearchParams(search)
  const slug = p.get('species')?.trim().toLowerCase() ?? ''
  if (!SLUG.test(slug) || slug.length > 64) return null
  const name = (p.get('name') ?? '').trim().slice(0, 80) || slug.replace(/-/g, ' ')
  const fromRaw = p.get('from')
  const from = fromRaw === 'identify' || fromRaw === 'profile' ? fromRaw : undefined
  const h: AskHandoff = { slug, name, from }
  const pct = p.get('p')
  if (from === 'identify' && pct && /^\d{1,3}$/.test(pct) && Number(pct) <= 100)
    h.probability = Number(pct) / 100
  if (from === 'identify' && p.get('low') === '1') h.lowConfidence = true
  return h
}

/** Lower-case a common name for mid-sentence use, keeping proper nouns like "Harbor seal" sensible. */
function midSentence(name: string): string {
  return name.length > 1 && name[1] === name[1]?.toLowerCase()
    ? name.charAt(0).toLowerCase() + name.slice(1)
    : name
}

/**
 * The pre-filled first question for a handoff. Class labels can be groups or plurals
 * ("Moths and butterflies", "Cattle", "Fish"), so the identify wording quotes the label as the
 * model's match instead of putting an article in front of it, and it is hedged when the
 * prediction was low-confidence.
 */
export function suggestedQuestion(h: AskHandoff): string {
  if (h.from === 'identify') {
    const pct = h.probability != null ? ` (${Math.round(h.probability * 100)}%)` : ''
    return h.lowConfidence
      ? `The model wasn't confident about my photo; its best guess was ${h.name}${pct}. ` +
          `How can I tell ${midSentence(h.name)} apart from similar animals, and where do they live?`
      : `The model's top match for my photo was ${h.name}${pct}. Where do they live, and how are they doing in the wild?`
  }
  return `Tell me about the ${midSentence(h.name)}: where does it live, what does it eat, and what is its conservation status?`
}
