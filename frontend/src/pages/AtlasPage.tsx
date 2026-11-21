import { Search, SearchX, X } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Section, SectionHeader } from '@/components/Section'
import { SpeciesCard } from '@/components/SpeciesCard'
import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { SpeciesSummary } from '@/lib/api'
import {
  DEFAULT_FILTERS,
  facetCounts,
  filterSpecies,
  filtersToParams,
  parseFilters,
  SORT_LABELS,
  type AtlasFilters,
  type AtlasSort,
} from '@/lib/atlas'
import { IUCN_CODES, IUCN_LABELS } from '@/lib/iucn'
import { speciesPhotoUrl, useSpeciesImages, useSpeciesList } from '@/lib/species'
import { usePageMeta } from '@/lib/page-meta'

const GROUPS = [
  'Mammal',
  'Bird',
  'Reptile',
  'Amphibian',
  'Fish',
  'Insect',
  'Arachnid',
  'Crustacean',
  'Mollusc',
  'Other',
]
const GROUP_PLURAL: Record<string, string> = {
  Mammal: 'Mammals',
  Bird: 'Birds',
  Reptile: 'Reptiles',
  Amphibian: 'Amphibians',
  Fish: 'Fish',
  Insect: 'Insects',
  Arachnid: 'Arachnids',
  Crustacean: 'Crustaceans',
  Mollusc: 'Molluscs',
  Other: 'Other invertebrates',
}

export default function AtlasPage() {
  usePageMeta(
    'Species Atlas',
    'All 80 animal classes WildLens knows, with conservation status, occurrence maps and per-class model accuracy.',
  )
  const [params, setParams] = useSearchParams()
  const filters = parseFilters(params)
  const { data, isPending, isError, error, refetch } = useSpeciesList()
  const { data: local } = useSpeciesImages()

  const rows = useMemo(() => data?.species ?? [], [data])
  const numbers = useMemo(() => new Map(rows.map((s, i) => [s.slug, i + 1])), [rows])
  const shown = useMemo(() => filterSpecies(rows, filters), [rows, filters])
  const counts = useMemo(() => facetCounts(rows, filters), [rows, filters])
  const presentGroups = GROUPS.filter((g) => rows.some((s) => (s.animal_group ?? 'Other') === g))
  const presentCodes = IUCN_CODES.filter((c) => rows.some((s) => s.iucn_code === c))
  const filtered = filters.q !== '' || filters.group !== 'any' || filters.status !== 'any'

  const update = (patch: Partial<AtlasFilters>) =>
    setParams(filtersToParams({ ...filters, ...patch }), { replace: true, preventScrollReset: true })

  return (
    <Section spacing="compact">
      <SectionHeader
        as="h1"
        eyebrow="Species Atlas"
        title="Eighty animals, one atlas"
        lead="Every class the model recognises: photograph, names, Red List status and how reliably the model identifies it on the test set."
        className="mb-10"
      />

      <form
        role="search"
        aria-label="Filter the atlas"
        onSubmit={(e) => e.preventDefault()}
        className="sticky top-16 z-20 -mx-4 mb-8 grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] items-end gap-4 border-b border-border bg-bg/95 px-4 pb-5 pt-4 backdrop-blur-[2px]"
      >
        <div>
          <Label htmlFor="atlas-q" className="mb-1.5 block text-caption text-fg-muted">
            Search
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <Input
              id="atlas-q"
              type="search"
              value={filters.q}
              placeholder="Common or scientific name, e.g. panda, Panthera"
              onChange={(e) => update({ q: e.target.value })}
              className="pl-9"
              autoComplete="off"
            />
          </div>
        </div>
        <FilterSelect
          id="atlas-group"
          label="Animal group"
          value={filters.group}
          onChange={(group) => update({ group })}
          options={[
            { value: 'any', label: 'All groups' },
            ...presentGroups.map((g) => ({
              value: g,
              label: GROUP_PLURAL[g] ?? g,
              count: counts.groups.get(g) ?? 0,
            })),
          ]}
        />
        <FilterSelect
          id="atlas-status"
          label="IUCN Red List status"
          value={filters.status}
          onChange={(status) => update({ status })}
          options={[
            { value: 'any', label: 'Any status' },
            ...presentCodes.map((c) => ({
              value: c,
              label: `${IUCN_LABELS[c]} (${c})`,
              count: counts.statuses.get(c) ?? 0,
            })),
            {
              value: 'NA',
              label: 'Not applicable (groups, domestic)',
              count: counts.statuses.get('NA') ?? 0,
            },
          ]}
        />
        <FilterSelect
          id="atlas-sort"
          label="Sort by"
          value={filters.sort}
          onChange={(sort) => update({ sort: sort as AtlasSort })}
          options={(Object.keys(SORT_LABELS) as AtlasSort[]).map((k) => ({
            value: k,
            label: SORT_LABELS[k],
          }))}
        />
      </form>

      <div className="mb-6 flex h-8 items-center justify-between">
        <p className="text-small text-fg-secondary" aria-live="polite" data-testid="atlas-count">
          {isPending ? (
            'Loading species…'
          ) : (
            <>
              Showing <span className="tabular font-medium text-fg">{shown.length}</span> of{' '}
              <span className="tabular">{rows.length}</span> classes
            </>
          )}
        </p>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParams(filtersToParams(DEFAULT_FILTERS), { replace: true })}
          >
            <X /> Clear filters
          </Button>
        )}
      </div>

      {isError ? (
        <ErrorState
          title="The atlas could not be loaded"
          message="The species list comes from the WildLens backend. Check that it is running, then retry."
          detail={error instanceof Error ? error.message : undefined}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : isPending ? (
        <div className="grid grid-cols-4 gap-6 min-[1800px]:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[22rem] rounded" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No classes match"
          description={
            filters.q
              ? `Nothing in the atlas matches “${filters.q}” with these filters. The Field Guide can answer questions about animals outside the 80 classes.`
              : 'No classes match this combination of filters.'
          }
          action={
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setParams(filtersToParams(DEFAULT_FILTERS), { replace: true })}
              >
                Clear filters
              </Button>
              {filters.q && (
                <Button asChild variant="ghost">
                  <Link to={`/ask`}>Ask the Field Guide</Link>
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <ul className="grid grid-cols-4 gap-6 min-[1800px]:grid-cols-5" data-testid="atlas-grid">
          {shown.map((s) => (
            <li key={s.slug}>
              <AtlasCard
                s={s}
                number={numbers.get(s.slug)}
                localSrc={speciesPhotoUrl(s.slug, 'card', null, local)}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function AtlasCard({ s, number, localSrc }: { s: SpeciesSummary; number?: number; localSrc: string | null }) {
  return (
    <SpeciesCard
      species={{ ...s, number, rank: s.rank ?? null, image: s.image ?? null }}
      imageSrc={localSrc}
      renderLink={(children) => (
        <Link to={`/species/${s.slug}`} aria-label={`${s.common_name} profile`}>
          {children}
        </Link>
      )}
    />
  )
}

interface Option {
  value: string
  label: string
  count?: number
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: Option[]
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-caption text-fg-muted">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} data-testid={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              hint={o.count}
              disabled={o.count === 0 && o.value !== value}
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
