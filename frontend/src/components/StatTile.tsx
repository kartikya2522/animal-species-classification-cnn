import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface StatDelta {
  /** Display text, e.g. "+4.1 pts". */
  value: string
  direction: 'up' | 'down' | 'flat'
  /** Whether "up" is good (default) — controls the colour. */
  positiveIsGood?: boolean
  label?: string
}

interface StatTileProps {
  value: ReactNode
  label: ReactNode
  unit?: string
  delta?: StatDelta
  footnote?: ReactNode
  size?: 'md' | 'lg'
  className?: string
}

export function StatTile({ value, label, unit, delta, footnote, size = 'lg', className }: StatTileProps) {
  const good =
    delta && delta.direction !== 'flat' && (delta.direction === 'up') === (delta.positiveIsGood ?? true)
  const DeltaIcon =
    delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus
  return (
    <div className={cn('flex flex-col', className)}>
      <dt className="type-overline order-2 mt-3 !text-fg-muted">{label}</dt>
      <dd className="order-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            'tabular font-serif font-[380] text-fg',
            size === 'lg' ? 'text-stat' : 'text-h3 leading-none',
          )}
        >
          {value}
        </span>
        {unit && <span className="tabular text-lead text-fg-muted">{unit}</span>}
      </dd>
      {(delta || footnote) && (
        <dd className="order-3 mt-2 space-y-1">
          {delta && (
            <span
              className={cn(
                'tabular inline text-caption font-medium',
                delta.direction === 'flat' ? 'text-fg-muted' : good ? 'text-success' : 'text-danger',
              )}
            >
              <DeltaIcon
                className="mr-1 inline size-3.5 -translate-y-px"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {delta.value}
              {delta.label && <span className="ml-1 font-normal text-fg-muted">{delta.label}</span>}
            </span>
          )}
          {footnote && <span className="type-caption block">{footnote}</span>}
        </dd>
      )}
    </div>
  )
}

/** A row of StatTiles separated by hairlines. Children should be StatTile elements. */
export function StatRow({
  children,
  className,
  columns,
}: {
  children: ReactNode
  className?: string
  columns?: 2 | 3 | 4 | 5
}) {
  return (
    <dl
      className={cn(
        'grid divide-x divide-border border-y border-border [&>*]:px-8 [&>*]:py-8 [&>*:first-child]:pl-0',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        (columns === 4 || !columns) && 'grid-cols-4',
        columns === 5 && 'grid-cols-5',
        className,
      )}
    >
      {children}
    </dl>
  )
}
