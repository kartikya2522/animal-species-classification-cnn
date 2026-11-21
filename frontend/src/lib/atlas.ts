/** Species Atlas filtering and sorting (client-side over the 80 rows from /api/species?extended=true). */
import type { SpeciesSummary } from '@/lib/api'

export type AtlasSort = 'az' | 'accuracy' | 'observations'
/** `any`, an IUCN code, or `NA` (no species-level status: groups, domestic forms, hybrid). */
export type AtlasStatus = string

export interface AtlasFilters {
  q: string
  group: string // 'any' or an animal group
  status: AtlasStatus
  sort: AtlasSort
}

export const DEFAULT_FILTERS: AtlasFilters = { q: '', group: 'any', status: 'any', sort: 'az' }

export const SORT_LABELS: Record<AtlasSort, string> = {
  az: 'Name, A–Z',
  accuracy: 'Model accuracy, highest first',
  observations: 'iNaturalist observations, most first',
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function matchesQuery(s: SpeciesSummary, q: string): boolean {
  const nq = norm(q)
  if (!nq) return true
  const hay = norm([s.label, s.common_name, s.scientific_name, s.animal_group].filter(Boolean).join(' '))
  return nq.split(' ').every((w) => hay.includes(w))
}

export function filterSpecies(rows: SpeciesSummary[], f: AtlasFilters): SpeciesSummary[] {
  const out = rows.filter((s) => {
    if (f.group !== 'any' && (s.animal_group ?? 'Other') !== f.group) return false
    if (f.status === 'NA' && s.iucn_code !== null) return false
    if (f.status !== 'any' && f.status !== 'NA' && s.iucn_code !== f.status) return false
    return matchesQuery(s, f.q)
  })
  const byName = (a: SpeciesSummary, b: SpeciesSummary) => a.common_name.localeCompare(b.common_name, 'en')
  const desc = (x: number | null | undefined, y: number | null | undefined) => (y ?? -1) - (x ?? -1)
  if (f.sort === 'az') out.sort(byName)
  else if (f.sort === 'accuracy') out.sort((a, b) => desc(a.model_accuracy, b.model_accuracy) || byName(a, b))
  else out.sort((a, b) => desc(a.inaturalist_observations, b.inaturalist_observations) || byName(a, b))
  return out
}

/** Counts per option over rows matching the *other* filters (so counts explain what a click will show). */
export function facetCounts(rows: SpeciesSummary[], f: AtlasFilters) {
  const groups = new Map<string, number>()
  const statuses = new Map<string, number>()
  for (const s of rows) {
    if (!matchesQuery(s, f.q)) continue
    const g = s.animal_group ?? 'Other'
    const st = s.iucn_code ?? 'NA'
    const statusOk = f.status === 'any' || st === f.status
    const groupOk = f.group === 'any' || g === f.group
    if (statusOk) groups.set(g, (groups.get(g) ?? 0) + 1)
    if (groupOk) statuses.set(st, (statuses.get(st) ?? 0) + 1)
  }
  return { groups, statuses }
}

export function parseFilters(params: URLSearchParams): AtlasFilters {
  const sort = params.get('sort')
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    group: params.get('group') || 'any',
    status: params.get('status') || 'any',
    sort: sort === 'accuracy' || sort === 'observations' ? sort : 'az',
  }
}

export function filtersToParams(f: AtlasFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.group !== 'any') p.set('group', f.group)
  if (f.status !== 'any') p.set('status', f.status)
  if (f.sort !== 'az') p.set('sort', f.sort)
  return p
}
