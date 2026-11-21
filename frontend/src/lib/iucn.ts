/** IUCN Red List categories as used by the species knowledge base. */

export const IUCN_CODES = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD', 'NE'] as const
export type IucnCode = (typeof IUCN_CODES)[number]

/** The ordered threat scale shown by IucnScale (DD/NE sit outside it). */
export const IUCN_SCALE: readonly IucnCode[] = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX']

export const IUCN_LABELS: Record<IucnCode, string> = {
  LC: 'Least Concern',
  NT: 'Near Threatened',
  VU: 'Vulnerable',
  EN: 'Endangered',
  CR: 'Critically Endangered',
  EW: 'Extinct in the Wild',
  EX: 'Extinct',
  DD: 'Data Deficient',
  NE: 'Not Evaluated',
}

export const THREATENED: readonly IucnCode[] = ['VU', 'EN', 'CR']

export function isIucnCode(value: unknown): value is IucnCode {
  return typeof value === 'string' && (IUCN_CODES as readonly string[]).includes(value)
}

/** Tailwind classes per category (kept literal so Tailwind can see them). */
export const IUCN_CLASSES: Record<IucnCode | 'NA', { fill: string; fg: string }> = {
  LC: { fill: 'bg-iucn-lc', fg: 'text-iucn-lc-fg' },
  NT: { fill: 'bg-iucn-nt', fg: 'text-iucn-nt-fg' },
  VU: { fill: 'bg-iucn-vu', fg: 'text-iucn-vu-fg' },
  EN: { fill: 'bg-iucn-en', fg: 'text-iucn-en-fg' },
  CR: { fill: 'bg-iucn-cr', fg: 'text-iucn-cr-fg' },
  EW: { fill: 'bg-iucn-ew', fg: 'text-iucn-ew-fg' },
  EX: { fill: 'bg-iucn-ex', fg: 'text-iucn-ex-fg' },
  DD: { fill: 'bg-iucn-dd', fg: 'text-iucn-dd-fg' },
  NE: { fill: 'bg-iucn-ne', fg: 'text-iucn-ne-fg' },
  NA: { fill: 'bg-iucn-na', fg: 'text-iucn-na-fg' },
}
