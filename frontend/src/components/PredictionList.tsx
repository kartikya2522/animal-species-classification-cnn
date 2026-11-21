import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { ConfidenceBar } from '@/components/ConfidenceBar'
import { ScientificName } from '@/components/ScientificName'
import type { Prediction } from '@/lib/api'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

interface PredictionListProps {
  predictions: Prediction[]
  lowConfidence?: boolean
  /** Threshold used by the backend, shown in the low-confidence note. */
  threshold?: number
  /** Optional scientific names by label, shown under the top-1 result. */
  scientificNames?: Record<string, string | undefined>
  /** `{label: slug}` from /api/predict; with `renderLink`, rows link to species pages. */
  slugs?: Record<string, string>
  renderLink?: (slug: string, children: ReactNode) => ReactNode
  className?: string
}

/** Top-k predictions: emphasised top-1, quieter runners-up, low-confidence warning. */
export function PredictionList({
  predictions,
  lowConfidence = false,
  threshold = 0.5,
  scientificNames,
  slugs,
  renderLink,
  className,
}: PredictionListProps) {
  const [top, ...rest] = predictions
  if (!top) return null
  const linkFor = (label: string, children: ReactNode) => {
    const slug = slugs?.[label]
    return slug && renderLink ? renderLink(slug, children) : children
  }

  return (
    <div className={cn('space-y-6', className)}>
      {lowConfidence && (
        <div
          role="status"
          className="flex gap-3 rounded border border-warning/40 bg-warning-subtle px-4 py-3"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-warning"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <div className="text-small">
            <p className="font-semibold text-fg">Low confidence</p>
            <p className="text-fg-secondary">
              The top match is below {formatPercent(threshold, 0)}. This photo may not show one of the 80
              species the model knows, or the animal may be small, partly hidden or unusually framed.
            </p>
          </div>
        </div>
      )}

      <div>
        <p className="type-overline mb-2 !text-fg-muted">{lowConfidence ? 'Closest match' : 'Most likely'}</p>
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className={cn('font-serif leading-tight text-fg', lowConfidence ? 'text-h3' : 'text-h2')}>
              {linkFor(
                top.label,
                <span className="inline-flex items-center gap-1.5">
                  {top.label}
                  {slugs?.[top.label] && renderLink && (
                    <ArrowUpRight className="size-5 text-fg-muted" strokeWidth={1.25} aria-hidden="true" />
                  )}
                </span>,
              )}
            </p>
            {scientificNames?.[top.label] && (
              <ScientificName
                name={scientificNames[top.label]}
                className="mt-1 block text-small text-fg-muted"
              />
            )}
          </div>
          <p
            className={cn(
              'tabular font-serif text-h3 leading-none',
              lowConfidence ? 'text-fg-muted' : 'text-fg',
            )}
          >
            {formatPercent(top.probability)}
          </p>
        </div>
        <ConfidenceBar
          value={top.probability}
          label={`${top.label} confidence`}
          emphasis
          muted={lowConfidence}
          className="mt-4"
        />
      </div>

      {rest.length > 0 && (
        <ol className="space-y-3.5 border-t border-border pt-5" aria-label="Other candidates">
          {rest.map((p, i) => (
            <li key={p.index} className="grid grid-cols-[1.5rem_1fr_4.5rem] items-center gap-x-3 gap-y-1.5">
              <span className="tabular font-mono text-caption text-fg-muted">{i + 2}</span>
              <span className="truncate text-small text-fg-secondary">{linkFor(p.label, p.label)}</span>
              <span className="tabular text-right text-small text-fg-muted">
                {formatPercent(p.probability)}
              </span>
              <span />
              <ConfidenceBar
                value={p.probability}
                label={`${p.label} confidence`}
                delay={0.08 * (i + 1)}
                className="col-span-2"
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
