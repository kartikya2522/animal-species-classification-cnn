import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Camera,
  ImageOff,
  Info,
  MapPinOff,
  MessageSquareText,
} from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Attribution } from '@/components/Attribution'
import { Container } from '@/components/layout/Container'
import { IucnScale } from '@/components/IucnScale'
import { ScientificName } from '@/components/ScientificName'
import { Section } from '@/components/Section'
import { EmptyState, ErrorState } from '@/components/States'
import { StatRow, StatTile } from '@/components/StatTile'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { SpeciesDetail } from '@/lib/api'
import { formatNumber, formatPercent } from '@/lib/format'
import { askLink } from '@/lib/handoff'
import { commonsThumb } from '@/lib/images'
import { isIucnCode } from '@/lib/iucn'
import { speciesPhotoUrl, useSpeciesDetail, useSpeciesImages, useSpeciesList } from '@/lib/species'
import { usePageMeta } from '@/lib/page-meta'

const OccurrenceMap = lazy(() => import('@/components/OccurrenceMap'))

const TAXON_RANKS = ['phylum', 'class', 'order', 'family', 'genus'] as const

export default function SpeciesProfilePage() {
  const { slug } = useParams()
  const { data: sp, isPending, isError, error, refetch } = useSpeciesDetail(slug)
  usePageMeta(
    sp?.common_name ?? (isError ? 'Species not found' : 'Species'),
    sp
      ? `${sp.common_name}${sp.scientific_name ? ` (${sp.scientific_name})` : ''}: summary, conservation status, occurrence map and model accuracy.`
      : undefined,
  )

  if (isPending) return <ProfileSkeleton />
  if (isError) {
    const notFound = (error as { status?: number }).status === 404
    return (
      <Section spacing="compact">
        {notFound ? (
          <EmptyState
            title="No such species in the atlas"
            description={`“${slug}” is not one of the 80 classes. Browse the atlas, or ask the Field Guide about any animal.`}
            action={
              <div className="flex gap-3">
                <Button asChild variant="secondary">
                  <Link to="/species">Open the Species Atlas</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/ask">Ask the Field Guide</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <ErrorState
            title="This profile could not be loaded"
            message="Species profiles come from the WildLens backend. Check that it is running, then retry."
            detail={error instanceof Error ? error.message : undefined}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Retry
              </Button>
            }
          />
        )}
      </Section>
    )
  }
  return <Profile sp={sp} />
}

function Profile({ sp }: { sp: SpeciesDetail }) {
  const { data: local } = useSpeciesImages()
  const { data: list } = useSpeciesList()
  const rows = list?.species ?? []
  const i = rows.findIndex((r) => r.slug === sp.slug)
  const prev = i > 0 ? rows[i - 1] : rows[rows.length - 1]
  const next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : rows[0]
  const code = isIucnCode(sp.iucn_status.code) ? sp.iucn_status.code : null
  const gbifNote = sp.gbif_taxon?.note ?? null
  const kind = sp.is_group ? 'group' : sp.domestic ? 'domestic' : sp.rank === 'hybrid' ? 'hybrid' : 'species'

  return (
    <article data-testid="species-profile">
      <Hero key={sp.slug} sp={sp} heroSrc={speciesPhotoUrl(sp.slug, 'hero', sp.image, local)} />

      <Section spacing="compact" className="pb-0">
        <div className="grid grid-cols-12 gap-12">
          <div className="col-span-7 space-y-10">
            {kind !== 'species' && <RankNote sp={sp} kind={kind} />}
            <div>
              <h2 className="type-overline mb-4 !text-fg-muted">Summary</h2>
              <p className="max-w-prose text-lead leading-relaxed text-fg-secondary">{sp.summary}</p>
              {sp.wikipedia_url && (
                <p className="mt-4 text-small text-fg-muted">
                  From{' '}
                  <a href={sp.wikipedia_url} target="_blank" rel="noreferrer" className="link">
                    Wikipedia: {sp.wikipedia_title ?? sp.common_name}
                  </a>
                  , available under CC BY-SA 4.0.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/identify">
                  <Camera /> Identify a photo
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={askLink({ slug: sp.slug, name: sp.common_name, from: 'profile' })}>
                  <MessageSquareText /> Ask the Field Guide
                </Link>
              </Button>
            </div>
          </div>

          <aside className="col-span-5 space-y-10">
            <IucnScale code={code} label={sp.iucn_status.label} source={sp.iucn_status.source} />
            <KeyFacts sp={sp} />
            <Taxonomy sp={sp} />
          </aside>
        </div>
      </Section>

      <Section spacing="compact" className="pb-0">
        <div className="border-t border-border pt-12">
          <div className="mb-6 flex items-end justify-between gap-10">
            <div>
              <h2 className="type-h3">Where it has been recorded</h2>
              <p className="mt-2 max-w-prose text-small text-fg-muted">
                Density of field observations in the Global Biodiversity Information Facility (GBIF): surveys,
                camera traps and citizen-science records. Museum specimens and zoo samples are left out, since
                their coordinates usually mark the collection rather than the animal; captive animals logged
                as observations cannot be filtered out. Records reflect where people look as much as where
                animals live
                {sp.domestic ? ', and for domestic animals mostly where they are kept' : ''}.
              </p>
            </div>
            {sp.gbif_taxon_key && (
              <a
                href={`https://www.gbif.org/species/${sp.gbif_taxon_key}`}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex shrink-0 items-center gap-1 text-small"
              >
                GBIF taxon {sp.gbif_taxon_key}{' '}
                <ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </a>
            )}
          </div>
          {gbifNote && sp.gbif_taxon_key && (
            <p className="mb-4 flex items-start gap-2 text-small text-fg-secondary" data-testid="gbif-note">
              <Info className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
              Map taxon: {sp.gbif_taxon?.name} ({sp.gbif_taxon?.rank}). {capitalise(gbifNote)}.
            </p>
          )}
          {sp.gbif_taxon_key ? (
            <Suspense fallback={<Skeleton className="h-[28rem] w-full rounded" />}>
              <OccurrenceMap
                taxonKey={sp.gbif_taxon_key}
                label={`${sp.common_name}${sp.scientific_name ? ` (${sp.scientific_name})` : ''}`}
              />
            </Suspense>
          ) : (
            <EmptyState
              icon={MapPinOff}
              title="No occurrence map for this class"
              description={
                gbifNote
                  ? `${capitalise(gbifNote)}, so GBIF cannot draw a single map for it.`
                  : 'This class has no matching taxon in the GBIF backbone.'
              }
              className="py-12"
            />
          )}
        </div>
      </Section>

      <Section spacing="compact" className="pb-0">
        <div className="grid grid-cols-12 gap-12 border-t border-border pt-12">
          <div className="col-span-5">
            <h2 className="type-h3">How the model does on this class</h2>
            <p className="mt-3 text-small text-fg-muted">
              ResNet50 on the held-out test split (tightly cropped photos). Real photos with more background
              are usually harder.
            </p>
            <Link to="/research" className="link mt-4 inline-flex items-center gap-1 text-small">
              Methods and all results on the Research page{' '}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="col-span-7">
            <StatRow columns={2}>
              <StatTile
                value={formatPercent(sp.model_stats?.test_accuracy, 1)}
                label="Test accuracy for this class"
              />
              <StatTile value={formatNumber(sp.model_stats?.test_images)} label="Test images" />
            </StatRow>
          </div>
        </div>
      </Section>

      <Container width="content" className="py-section">
        <nav aria-label="Other species" className="grid grid-cols-2 gap-6 border-t border-border pt-8">
          {prev && (
            <Link to={`/species/${prev.slug}`} className="group flex items-center gap-4" rel="prev">
              <ArrowLeft
                className="size-5 text-fg-muted transition-transform group-hover:-translate-x-1"
                strokeWidth={1.25}
                aria-hidden="true"
              />
              <span>
                <span className="type-overline block !text-fg-muted">Previous</span>
                <span className="font-serif text-h4 text-fg group-hover:text-accent-text">
                  {prev.common_name}
                </span>
              </span>
            </Link>
          )}
          {next && (
            <Link
              to={`/species/${next.slug}`}
              className="group col-start-2 flex items-center justify-end gap-4 text-right"
              rel="next"
            >
              <span>
                <span className="type-overline block !text-fg-muted">Next</span>
                <span className="font-serif text-h4 text-fg group-hover:text-accent-text">
                  {next.common_name}
                </span>
              </span>
              <ArrowRight
                className="size-5 text-fg-muted transition-transform group-hover:translate-x-1"
                strokeWidth={1.25}
                aria-hidden="true"
              />
            </Link>
          )}
        </nav>
      </Container>
    </article>
  )
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* ------------------------------------------------------------------ hero */

function Hero({ sp, heroSrc }: { sp: SpeciesDetail; heroSrc: string | null }) {
  const fallback = commonsThumb(sp.image?.url, 1280, sp.image?.width)
  const sources = [heroSrc, fallback].filter((u, i, a): u is string => Boolean(u) && a.indexOf(u) === i)
  const [attempt, setAttempt] = useState(0)
  const src = sources[attempt]
  const groupLabel = sp.animal_group ?? 'Animal'

  return (
    <header className="border-b border-border bg-surface-sunken">
      <Container width="content" className="grid grid-cols-12 items-end gap-12 py-12">
        <div className="col-span-5 pb-2">
          <Link
            to="/species"
            className="mb-10 inline-flex items-center gap-1.5 text-small text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" /> Species Atlas
          </Link>
          <p className="type-overline mb-4 flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-8 bg-accent" />
            {groupLabel}
            {sp.is_group ? ' · group of species' : sp.domestic ? ' · domestic form' : ''}
          </p>
          <h1 className="type-h1">{sp.common_name}</h1>
          <p className="mt-3 text-lead text-fg-secondary">
            <ScientificName name={sp.scientific_name} rank={sp.rank} />
            {sp.rank && sp.rank !== 'species' && (
              <span className="ml-2 font-mono text-caption uppercase tracking-[0.12em] text-fg-muted">
                {sp.rank}
              </span>
            )}
          </p>
          {sp.description && (
            <p className="mt-6 max-w-md text-small text-fg-muted">{capitalise(sp.description)}.</p>
          )}
        </div>
        <figure className="col-span-7">
          <div className="aspect-[3/2] overflow-hidden rounded bg-surface">
            {src ? (
              <img
                src={src}
                alt={`${sp.common_name}${sp.image?.file ? '' : ''}`}
                onError={() => setAttempt((n) => n + 1)}
                className="size-full object-cover"
                data-testid="profile-hero"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-fg-muted">
                <ImageOff className="size-7" strokeWidth={1} aria-hidden="true" />
                <span className="sr-only">Image unavailable</span>
              </div>
            )}
          </div>
          {sp.image && (
            <figcaption className="mt-3">
              <Attribution image={sp.image} />
            </figcaption>
          )}
        </figure>
      </Container>
    </header>
  )
}

/* ------------------------------------------------------------------ side panels */

function RankNote({ sp, kind }: { sp: SpeciesDetail; kind: string }) {
  const text: Record<string, ReactNode> = {
    group: (
      <>
        “{sp.label}” is a <strong className="font-medium text-fg">group</strong>, not a single species. The
        model learned it from photos of several related animals, so the name, Red List note and map below
        describe the whole {sp.rank ?? 'group'}
        {sp.scientific_name && (
          <>
            {' '}
            <ScientificName name={sp.scientific_name} rank={sp.rank} />
          </>
        )}
        .
      </>
    ),
    domestic: (
      <>
        “{sp.label}” is a <strong className="font-medium text-fg">domestic form</strong>. Red List categories
        apply to wild species, so no conservation status is shown.
      </>
    ),
    hybrid: (
      <>
        “{sp.label}” is a <strong className="font-medium text-fg">hybrid</strong>, not a species, so it has no
        Red List status or GBIF taxon.
      </>
    ),
    species: null,
  }
  return (
    <div className="flex gap-4 rounded border border-border bg-surface px-5 py-4" data-testid="rank-note">
      <Info className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
      <div className="text-small text-fg-secondary">
        {text[kind] && <p>{text[kind]}</p>}
        {sp.rank_note && (
          <p className={text[kind] ? 'mt-2 text-fg-muted' : ''}>Class definition: {sp.rank_note}.</p>
        )}
      </div>
    </div>
  )
}

function KeyFacts({ sp }: { sp: SpeciesDetail }) {
  const facts: Array<[string, ReactNode]> = [
    ['Animal group', sp.animal_group ?? '—'],
    ['Rank', sp.rank ? capitalise(sp.rank) : '—'],
    [
      'iNaturalist observations',
      sp.inaturalist_taxon_id ? (
        <a
          href={`https://www.inaturalist.org/taxa/${sp.inaturalist_taxon_id}`}
          target="_blank"
          rel="noreferrer"
          className="link tabular"
        >
          {formatNumber(sp.inaturalist_observations)}
        </a>
      ) : (
        formatNumber(sp.inaturalist_observations)
      ),
    ],
    [
      'Wikidata',
      sp.wikidata_id ? (
        <a
          href={`https://www.wikidata.org/wiki/${sp.wikidata_id}`}
          target="_blank"
          rel="noreferrer"
          className="link font-mono text-caption"
        >
          {sp.wikidata_id}
        </a>
      ) : (
        '—'
      ),
    ],
  ]
  return (
    <div>
      <h2 className="type-overline mb-3 !text-fg-muted">Key facts</h2>
      <dl className="divide-y divide-border border-y border-border">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 py-2.5 text-small">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="text-right text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Taxonomy({ sp }: { sp: SpeciesDetail }) {
  const rows = TAXON_RANKS.map((r) => [r, sp.taxonomy[r]] as const).filter(([, v]) => v)
  if (!rows.length) return null
  return (
    <div>
      <h2 className="type-overline mb-3 !text-fg-muted">Taxonomy</h2>
      <dl className="divide-y divide-border border-y border-border">
        {rows.map(([rank, name]) => (
          <div key={rank} className="flex items-baseline justify-between gap-6 py-2.5 text-small">
            <dt className="capitalize text-fg-muted">{rank}</dt>
            <dd className="text-fg">
              <ScientificName name={name} rank={rank} />
            </dd>
          </div>
        ))}
        {!sp.is_group && sp.scientific_name && sp.rank === 'species' && (
          <div className="flex items-baseline justify-between gap-6 py-2.5 text-small">
            <dt className="text-fg-muted">Species</dt>
            <dd className="text-fg">
              <ScientificName name={sp.scientific_name} rank="species" />
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading species profile">
      <div className="border-b border-border bg-surface-sunken">
        <Container width="content" className="grid grid-cols-12 items-end gap-12 py-12">
          <div className="col-span-5 space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-14 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
          <Skeleton className="col-span-7 aspect-[3/2] rounded" />
        </Container>
      </div>
      <Container width="content" className="grid grid-cols-12 gap-12 py-16">
        <div className="col-span-7 space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
        <Skeleton className="col-span-5 h-40" />
      </Container>
    </div>
  )
}
