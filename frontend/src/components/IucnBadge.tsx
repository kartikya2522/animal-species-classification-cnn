import { IUCN_CLASSES, IUCN_LABELS, type IucnCode } from '@/lib/iucn'
import { cn } from '@/lib/utils'

interface IucnBadgeProps {
  /** IUCN code, or null when no species-level status applies. */
  code: IucnCode | null
  /** Label from the KB (used for the null case, e.g. "Not applicable (group)"). */
  label?: string | null
  size?: 'sm' | 'md'
  /** Show the full category name next to the code. */
  showLabel?: boolean
  /** Shorten "Not applicable (group)" to "Group" etc. for tight layouts (full text stays for screen readers). */
  compact?: boolean
  className?: string
}

/** Red List category chip: filled code square + category name in body ink. */
export function IucnBadge({
  code,
  label,
  size = 'md',
  showLabel = true,
  compact = false,
  className,
}: IucnBadgeProps) {
  const text = code ? IUCN_LABELS[code] : label || 'Not applicable'
  const paren = !code && compact ? /\(([^)]+)\)/.exec(text)?.[1] : undefined
  const shown = paren ? paren.charAt(0).toUpperCase() + paren.slice(1) : text
  const cls = IUCN_CLASSES[code ?? 'NA']
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap text-fg-secondary',
        size === 'sm' ? 'text-caption' : 'text-small',
        className,
      )}
      title={showLabel && shown === text ? undefined : `IUCN Red List: ${text}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-sm font-mono font-semibold tracking-tight',
          size === 'sm' ? 'h-5 min-w-7 px-1 text-[0.6875rem]' : 'h-6 min-w-8 px-1.5 text-[0.75rem]',
          cls.fill,
          cls.fg,
          !code && 'border border-dashed border-border-strong bg-transparent',
          code === 'NE' && 'border border-border-strong',
        )}
      >
        {code ?? 'N/A'}
      </span>
      {showLabel ? (
        <>
          <span aria-hidden={shown !== text}>{shown}</span>
          <span className="sr-only">{shown !== text ? `IUCN Red List: ${text}` : ' (IUCN Red List)'}</span>
        </>
      ) : (
        <span className="sr-only">IUCN Red List: {text}</span>
      )}
    </span>
  )
}
