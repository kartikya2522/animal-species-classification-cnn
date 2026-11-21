import { ImageOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Attribution, type AttributionImage } from '@/components/Attribution'
import { IucnBadge } from '@/components/IucnBadge'
import { ScientificName } from '@/components/ScientificName'
import type { SpeciesSummary } from '@/lib/api'
import { formatPercent } from '@/lib/format'
import { commonsThumb } from '@/lib/images'
import { cn } from '@/lib/utils'

export interface SpeciesCardData extends Pick<
  SpeciesSummary,
  | 'slug'
  | 'common_name'
  | 'scientific_name'
  | 'is_group'
  | 'animal_group'
  | 'iucn_code'
  | 'iucn_label'
  | 'model_accuracy'
> {
  image?: (AttributionImage & { url?: string | null; width?: number | null }) | null
  rank?: string | null
  /** Catalogue number (1-based class index) for the field-notes header. */
  number?: number
}

interface SpeciesCardProps {
  species: SpeciesCardData
  /** Preferred photo URL (e.g. the local offline copy); falls back to the Commons thumbnail on error. */
  imageSrc?: string | null
  /**
   * Make the card a link, e.g. `(children) => <Link to={...}>{children}</Link>`. Only the title is
   * wrapped; a stretched `::after` overlay makes the whole card clickable, so the photo credit can
   * stay a separate link without nesting `<a>` elements.
   */
  renderLink?: (children: ReactNode) => ReactNode
  className?: string
}

/** "Field notes" card: photograph, names, status and the model's accuracy for the class. */
export function SpeciesCard({ species, imageSrc, renderLink, className }: SpeciesCardProps) {
  const [attempt, setAttempt] = useState(0)
  const commons = commonsThumb(species.image?.url, 500, species.image?.width)
  const sources = [imageSrc, commons].filter((u, i, a): u is string => Boolean(u) && a.indexOf(u) === i)
  const src = sources[attempt] ?? null
  const failed = src === null && sources.length > 0
  const setFailed = () => setAttempt((n) => n + 1)

  const body = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
        {src && !failed ? (
          <img
            src={src}
            alt={species.common_name}
            loading="lazy"
            onError={setFailed}
            className="size-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-fg-muted">
            <ImageOff className="size-6" strokeWidth={1} aria-hidden="true" />
            <span className="sr-only">Image unavailable</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center justify-between font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-fg-muted">
          <span>
            {species.animal_group ?? 'Animal'}
            {species.is_group && ' · group'}
          </span>
          {species.number != null && (
            <span className="tabular">No. {String(species.number).padStart(3, '0')}</span>
          )}
        </div>
        <h3
          className={cn(
            'font-serif text-h4 font-[450] leading-snug text-fg',
            // Stretched link: the title link's ::after covers the whole (relative) card.
            renderLink &&
              "[&_a:focus-visible]:outline-none [&_a]:after:absolute [&_a]:after:inset-0 [&_a]:after:content-['']",
          )}
        >
          {renderLink ? renderLink(species.common_name) : species.common_name}
        </h3>
        <ScientificName
          name={species.scientific_name}
          rank={species.rank}
          className="mt-0.5 text-small text-fg-muted"
        />
        <div className="flex-1" />
        <div className="mt-5 flex items-end justify-between gap-3 border-t border-border pt-4">
          <IucnBadge code={species.iucn_code} label={species.iucn_label} size="sm" compact />
          <div className="text-right">
            <p className="tabular text-small font-medium text-fg">{formatPercent(species.model_accuracy)}</p>
            <p className="whitespace-nowrap text-[0.6875rem] text-fg-muted">model accuracy</p>
          </div>
        </div>
      </div>
      {species.image && src && !failed && (
        // Photo credit, laid over the bottom of the photo. It comes after the title in the DOM so
        // the tab order is title link, then credit links; z-10 keeps it above the title link's
        // stretched overlay, and it only takes pointer events while visible.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 aspect-[4/3] overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-[rgb(10_20_15/0.72)] px-3 py-2 opacity-0 transition duration-300 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
            <Attribution image={species.image} variant="overlay" className="truncate" />
          </div>
        </div>
      )}
    </>
  )

  const shell = cn(
    'group relative flex h-full flex-col overflow-hidden rounded border border-border bg-surface transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-raised',
    className,
  )
  return renderLink ? (
    <div
      className={cn(
        shell,
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
      )}
    >
      {body}
    </div>
  ) : (
    <div className={shell}>{body}</div>
  )
}
