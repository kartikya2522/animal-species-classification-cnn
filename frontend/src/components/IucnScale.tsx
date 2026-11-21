import { IUCN_CLASSES, IUCN_LABELS, IUCN_SCALE, type IucnCode } from '@/lib/iucn'
import { cn } from '@/lib/utils'

interface IucnScaleProps {
  code: IucnCode | null
  /** KB label, shown for the null (not applicable) case. */
  label?: string | null
  /** Where the status came from, e.g. "IUCN Red List via Wikidata (P141)". */
  source?: string | null
  className?: string
}

/**
 * Horizontal Red List indicator, Least Concern → Extinct, with the current category
 * highlighted. DD/NE and "not applicable" render the scale inactive with a note.
 */
export function IucnScale({ code, label, source, className }: IucnScaleProps) {
  const onScale = code !== null && IUCN_SCALE.includes(code)
  const statusText = code ? IUCN_LABELS[code] : label || 'Not applicable'
  let note: string | null = null
  if (code === null)
    note =
      'Red List categories are assessed for individual species, not for groups, domestic forms or hybrids.'
  else if (code === 'DD') note = 'Not enough information to place this species on the threat scale.'
  else if (code === 'NE') note = 'This species has not yet been assessed against the Red List criteria.'

  return (
    <figure className={cn('w-full', className)}>
      <figcaption className="mb-4 flex items-baseline justify-between gap-6">
        <span className="type-overline !text-fg-muted">IUCN Red List</span>
        <span className="text-small font-medium text-fg" data-testid="iucn-status">
          {statusText}
        </span>
      </figcaption>
      <ol
        aria-label={`Conservation status scale: ${statusText}`}
        className={cn('grid grid-cols-7 gap-[3px]', !onScale && 'opacity-60')}
      >
        {IUCN_SCALE.map((c) => {
          const active = c === code
          const cls = IUCN_CLASSES[c]
          return (
            <li
              key={c}
              aria-current={active ? 'true' : undefined}
              className="flex flex-col items-center gap-2"
            >
              <span
                className={cn(
                  'relative flex h-8 w-full items-center justify-center font-mono text-[0.75rem] font-semibold transition-colors',
                  active ? cn(cls.fill, cls.fg) : 'bg-surface-sunken text-fg-muted',
                  c === 'LC' && 'rounded-l-sm',
                  c === 'EX' && 'rounded-r-sm',
                )}
              >
                {c}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-[7px] left-1/2 size-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-fg"
                  />
                )}
              </span>
              <span className={cn('sr-only')}>{IUCN_LABELS[c]}</span>
            </li>
          )
        })}
      </ol>
      <div aria-hidden="true" className="mt-2 flex justify-between text-caption text-fg-muted">
        <span>Least concern</span>
        <span>Threatened</span>
        <span>Extinct</span>
      </div>
      {(note || source) && (
        <p className="type-caption mt-4 border-t border-border pt-3">
          {note}
          {note && source && ' '}
          {source && <span className="font-mono text-[0.75rem]">Source: {source}</span>}
        </p>
      )}
    </figure>
  )
}
