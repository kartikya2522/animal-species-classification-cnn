import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { SpeciesSummary } from '@/lib/api'
import { formatPercent } from '@/lib/format'
import { modelColor, sortClassRows, type ClassRow, type ClassSort } from '@/lib/research'
import { cn } from '@/lib/utils'

interface PerClassViewProps {
  rows: ClassRow[]
  primaryId: string
  primaryName: string
  compareId?: string
  compareName?: string
  /** From /api/species (optional): label → slug and test-image counts. */
  species?: SpeciesSummary[]
}

type Key = 'label' | 'accuracy' | 'compare'

function ClassLink({ label, slug }: { label: string; slug?: string }) {
  return slug ? (
    <Link to={`/species/${slug}`} className="link">
      {label}
    </Link>
  ) : (
    <span className="text-fg">{label}</span>
  )
}

function Bar({ value, color }: { value: number | null; color: string }) {
  return (
    <span className="flex items-center justify-end gap-3">
      <span className="tabular w-12 text-right">{formatPercent(value)}</span>
      <span aria-hidden="true" className="relative h-1.5 w-28 overflow-hidden rounded-full bg-surface-sunken">
        {value != null && (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${value * 100}%`, background: color }}
          />
        )}
      </span>
    </span>
  )
}

export function PerClassView({
  rows,
  primaryId,
  primaryName,
  compareId,
  compareName,
  species,
}: PerClassViewProps) {
  const [sort, setSort] = useState<{ key: Key; dir: 'asc' | 'desc' }>({ key: 'accuracy', dir: 'asc' })
  const byLabel = useMemo(() => new Map((species ?? []).map((s) => [s.label, s])), [species])

  const sorted = useMemo(() => {
    const base: ClassSort =
      sort.key === 'label' ? 'label' : sort.key === 'compare' ? 'compare-asc' : 'accuracy-asc'
    const out = sortClassRows(rows, base)
    return sort.dir === 'desc' ? out.reverse() : out
  }, [rows, sort])

  const ascending = sortClassRows(rows, 'accuracy-asc')
  const hardest = ascending.slice(0, 8)
  const easiest = ascending.slice(-8).reverse()

  const header = (key: Key, children: ReactNode, align: 'left' | 'right' = 'right') => {
    const active = sort.key === key
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn('px-4 py-2.5 font-medium', align === 'right' && 'text-right')}
      >
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
          className={cn(
            'inline-flex items-center gap-1.5 hover:text-fg',
            active ? 'text-fg' : 'text-fg-muted',
          )}
        >
          {children}
          <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </th>
    )
  }

  const list = (title: string, items: ClassRow[], testid: string) => (
    <div>
      <p className="type-overline mb-3 !text-fg-muted">{title}</p>
      <ol className="divide-y divide-border border-y border-border" data-testid={testid}>
        {items.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4 py-2 text-small">
            <ClassLink label={r.label} slug={byLabel.get(r.label)?.slug} />
            <span className="tabular text-fg-secondary">{formatPercent(r.accuracy)}</span>
          </li>
        ))}
      </ol>
    </div>
  )

  return (
    <div className="grid grid-cols-12 gap-12">
      <div className="col-span-4 space-y-10">
        {list(`Hardest for ${primaryName}`, hardest, 'hardest-classes')}
        {list(`Easiest for ${primaryName}`, easiest, 'easiest-classes')}
      </div>
      <div className="col-span-8">
        <div className="max-h-[38rem] overflow-y-auto rounded border border-border bg-surface-raised">
          <table className="tabular w-full text-left text-small" data-testid="per-class-table">
            <caption className="sr-only">
              Per-class test accuracy for {primaryName}
              {compareName ? ` and ${compareName}` : ''}; column headers sort the table.
            </caption>
            <thead className="sticky top-0 z-10 border-b border-border bg-surface text-caption">
              <tr>
                {header('label', 'Class', 'left')}
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-fg-muted">
                  Test crops
                </th>
                {header('accuracy', primaryName)}
                {compareName && header('compare', compareName)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-fg-secondary">
              {sorted.map((r) => {
                const sp = byLabel.get(r.label)
                return (
                  <tr key={r.label}>
                    <th scope="row" className="px-4 py-2 font-normal">
                      <ClassLink label={r.label} slug={sp?.slug} />
                    </th>
                    <td className="px-4 py-2 text-right text-fg-muted">{sp?.test_images ?? '—'}</td>
                    <td className="px-4 py-2">
                      <Bar value={r.accuracy} color={modelColor(primaryId)} />
                    </td>
                    {compareName && (
                      <td className="px-4 py-2">
                        <Bar value={r.compare} color={modelColor(compareId ?? '')} />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
