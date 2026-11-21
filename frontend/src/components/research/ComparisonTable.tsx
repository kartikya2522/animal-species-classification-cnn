import {
  bestByColumn,
  COLUMNS,
  formatCell,
  formatCellLong,
  modelColor,
  type ComparisonRow,
} from '@/lib/research'
import { cn } from '@/lib/utils'

/** The four-model comparison: best value per column marked (bold + label), blanks explained below. */
export function ComparisonTable({ rows, id }: { rows: ComparisonRow[]; id?: string }) {
  const best = bestByColumn(rows)
  return (
    <div className="overflow-hidden rounded border border-border bg-surface-raised">
      <table id={id} className="tabular w-full text-left text-small" data-testid="comparison-table">
        <caption className="sr-only">
          Test-set metrics for the four models. The best value in each column is marked “best”.
        </caption>
        <thead className="border-b border-border bg-surface text-caption text-fg-muted">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">
              Model
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className="px-4 py-3 text-right font-medium">
                {c.label}
                <span className="block text-[11px] font-normal">
                  {c.better === 'higher' ? 'higher is better' : 'lower is better'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} data-model={r.id}>
              <th scope="row" className="px-5 py-4 font-normal">
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: modelColor(r.id) }}
                  />
                  <span>
                    <span className="block font-medium text-fg">{r.name}</span>
                    <span className="block text-caption text-fg-muted">
                      {r.role}
                      {r.deployed && <span className="text-accent-text"> · live demo</span>}
                    </span>
                  </span>
                </span>
              </th>
              {COLUMNS.map((c) => {
                const cell = r.cells[c.key]
                const isBest = best[c.key].includes(r.id)
                return (
                  <td
                    key={c.key}
                    data-col={c.key}
                    className={cn(
                      'px-4 py-4 text-right align-top',
                      isBest ? 'font-semibold text-fg' : 'text-fg-secondary',
                      cell.value == null && 'text-fg-muted',
                    )}
                  >
                    <span aria-label={formatCellLong(c, cell)} title={formatCellLong(c, cell)}>
                      {formatCell(c, cell)}
                    </span>
                    {cell.origin === 'derived' && (
                      <sup className="ml-0.5 text-accent-text" aria-label="derived, see notes">
                        †
                      </sup>
                    )}
                    {cell.value == null && (
                      <sup className="ml-0.5 text-fg-muted" aria-label="not recorded, see notes">
                        *
                      </sup>
                    )}
                    {isBest && (
                      <span className="mt-1 block text-[11px] font-medium uppercase tracking-wider text-accent-text">
                        best
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
