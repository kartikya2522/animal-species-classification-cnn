import { describe, expect, it } from 'vitest'

import type { SpeciesSummary } from '@/lib/api'
import { DEFAULT_FILTERS, facetCounts, filterSpecies, filtersToParams, parseFilters } from '@/lib/atlas'

const row = (p: Partial<SpeciesSummary> & { slug: string }): SpeciesSummary => ({
  label: p.slug,
  common_name: p.slug,
  scientific_name: null,
  is_group: false,
  animal_group: 'Mammal',
  thumb_url: null,
  iucn_code: null,
  iucn_label: null,
  model_accuracy: null,
  ...p,
})

const ROWS: SpeciesSummary[] = [
  row({
    slug: 'red-panda',
    common_name: 'Red panda',
    scientific_name: 'Ailurus fulgens',
    iucn_code: 'EN',
    model_accuracy: 0.9,
    inaturalist_observations: 5000,
  }),
  row({
    slug: 'panda',
    common_name: 'Panda',
    scientific_name: 'Ailuropoda melanoleuca',
    iucn_code: 'VU',
    model_accuracy: 0.95,
    inaturalist_observations: 3000,
  }),
  row({
    slug: 'bear',
    common_name: 'Bear',
    scientific_name: 'Ursidae',
    is_group: true,
    model_accuracy: 0.6,
    inaturalist_observations: 136000,
  }),
  row({
    slug: 'owl',
    common_name: 'Owl',
    scientific_name: 'Strigiformes',
    animal_group: 'Bird',
    is_group: true,
    model_accuracy: 0.8,
    inaturalist_observations: 90000,
  }),
  row({
    slug: 'tiger',
    common_name: 'Tiger',
    scientific_name: 'Panthera tigris',
    iucn_code: 'EN',
    model_accuracy: null,
    inaturalist_observations: null,
  }),
]

const slugs = (rows: SpeciesSummary[]) => rows.map((r) => r.slug)

describe('filterSpecies', () => {
  it('sorts A–Z by default', () => {
    expect(slugs(filterSpecies(ROWS, DEFAULT_FILTERS))).toEqual([
      'bear',
      'owl',
      'panda',
      'red-panda',
      'tiger',
    ])
  })

  it('searches common and scientific names, case- and accent-insensitive, all words', () => {
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, q: 'PANDA' }))).toEqual(['panda', 'red-panda'])
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, q: 'ailurus' }))).toEqual(['red-panda'])
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, q: 'red pánda' }))).toEqual(['red-panda'])
    expect(filterSpecies(ROWS, { ...DEFAULT_FILTERS, q: 'axolotl' })).toEqual([])
  })

  it('filters by group and IUCN status, including not applicable', () => {
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, group: 'Bird' }))).toEqual(['owl'])
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, status: 'EN' }))).toEqual(['red-panda', 'tiger'])
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, status: 'NA' }))).toEqual(['bear', 'owl'])
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, status: 'NA', group: 'Mammal' }))).toEqual([
      'bear',
    ])
  })

  it('sorts by accuracy and observations, missing values last', () => {
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, sort: 'accuracy' }))).toEqual([
      'panda',
      'red-panda',
      'owl',
      'bear',
      'tiger',
    ])
    expect(slugs(filterSpecies(ROWS, { ...DEFAULT_FILTERS, sort: 'observations' }))).toEqual([
      'bear',
      'owl',
      'red-panda',
      'panda',
      'tiger',
    ])
  })

  it('does not mutate the input', () => {
    const copy = [...ROWS]
    filterSpecies(ROWS, { ...DEFAULT_FILTERS, sort: 'accuracy' })
    expect(ROWS).toEqual(copy)
  })
})

describe('facetCounts', () => {
  it('counts each facet against the other active filters', () => {
    const c = facetCounts(ROWS, { ...DEFAULT_FILTERS, status: 'EN' })
    expect(c.groups.get('Mammal')).toBe(2)
    expect(c.groups.get('Bird')).toBeUndefined()
    // status counts ignore the status filter itself
    expect(c.statuses.get('NA')).toBe(2)
    expect(c.statuses.get('VU')).toBe(1)
  })
})

describe('URL round-trip', () => {
  it('keeps only non-default values and parses back', () => {
    const f = { q: 'panda', group: 'Mammal', status: 'NA', sort: 'observations' as const }
    const p = filtersToParams(f)
    expect(p.toString()).toBe('q=panda&group=Mammal&status=NA&sort=observations')
    expect(parseFilters(p)).toEqual(f)
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('')
    expect(parseFilters(new URLSearchParams('sort=bogus')).sort).toBe('az')
  })
})
