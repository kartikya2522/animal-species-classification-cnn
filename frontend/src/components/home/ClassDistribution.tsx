import { useState } from 'react'

import distribution from '@/content/class-distribution.json'
import { formatNumber } from '@/lib/format'

const ROWS = distribution.classes
const MAX = Math.max(...ROWS.map((r) => r.train + r.augmented))
const TICKS = [500, 1000, 1500, 2000]
const THRESHOLD = 100
const HEIGHT = 260

/**
 * Training crops per class (from data/manifest.csv), sorted, with the augmented copies stacked on
 * the rare classes. Plain HTML/CSS so the home page does not load the chart library.
 */
export function ClassDistribution() {
  const [active, setActive] = useState<(typeof ROWS)[number] | null>(null)
  const pct = (n: number) => `${(n / MAX) * 100}%`
  return (
    <figure>
      <div className="mb-3 flex min-h-6 items-baseline justify-between gap-6 text-caption">
        <div className="flex items-center gap-5 text-fg-secondary">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-fg-muted" />
            Original training crops
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-accent" />
            Augmented copies
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block w-4 border-t border-dashed border-fg-muted" />
            100 crops: classes below were augmented to 150
          </span>
        </div>
        <p className="tabular text-fg-secondary" aria-live="polite">
          {active ? (
            <>
              <span className="font-medium text-fg">{active.label}</span> · {formatNumber(active.train)}{' '}
              training crops
              {active.augmented > 0 && ` + ${formatNumber(active.augmented)} augmented`} ·{' '}
              {formatNumber(active.test)} test
            </>
          ) : (
            <span className="text-fg-muted">Hover a column for its counts</span>
          )}
        </p>
      </div>

      <div
        role="img"
        aria-label={`Training crops per class, from ${ROWS[0]?.label} (${formatNumber(ROWS[0]?.train)}) down to ${ROWS.at(-1)?.label} (${formatNumber(ROWS.at(-1)?.train)}). ${distribution.classes.filter((c) => c.augmented).length} classes below ${THRESHOLD} crops were augmented to 150.`}
        className="relative ml-10"
        style={{ height: HEIGHT }}
        onMouseLeave={() => setActive(null)}
      >
        {TICKS.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-chart-grid" style={{ bottom: pct(t) }}>
            <span className="tabular absolute -left-10 -top-2 w-8 text-right text-[11px] text-fg-muted">
              {formatNumber(t)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-border-strong">
          {ROWS.map((r) => (
            <div
              key={r.label}
              className="flex h-full flex-1 cursor-default flex-col justify-end"
              onMouseEnter={() => setActive(r)}
            >
              {r.augmented > 0 && (
                <div
                  className="rounded-t-[2px] bg-accent"
                  style={{ height: pct(r.augmented), opacity: active && active !== r ? 0.45 : 1 }}
                />
              )}
              <div
                className={r.augmented > 0 ? 'bg-fg-muted' : 'rounded-t-[2px] bg-fg-muted'}
                style={{ height: pct(r.train), opacity: active && active !== r ? 0.45 : 1 }}
              />
            </div>
          ))}
        </div>
        <div
          className="absolute inset-x-0 border-t border-dashed border-fg-muted"
          style={{ bottom: pct(THRESHOLD) }}
        >
          <span className="tabular absolute -left-10 -top-2 w-8 text-right text-[11px] text-fg-muted">
            100
          </span>
        </div>
      </div>
      <div className="ml-10 mt-2 flex justify-between text-caption text-fg-muted">
        <span>{ROWS[0]?.label}</span>
        <span>80 classes, most to fewest training crops</span>
        <span>{ROWS.at(-1)?.label}</span>
      </div>

      <details className="ml-10 mt-5 text-small">
        <summary className="cursor-pointer text-fg-secondary hover:text-fg">Show as a table</summary>
        <div className="mt-3 max-h-80 overflow-y-auto rounded border border-border">
          <table className="tabular w-full text-left text-caption">
            <thead className="sticky top-0 bg-surface text-fg-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 text-right font-medium">Training crops</th>
                <th className="px-3 py-2 text-right font-medium">Augmented</th>
                <th className="px-3 py-2 text-right font-medium">Validation</th>
                <th className="px-3 py-2 text-right font-medium">Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-fg-secondary">
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <td className="px-3 py-1.5 text-fg">{r.label}</td>
                  <td className="px-3 py-1.5 text-right">{formatNumber(r.train)}</td>
                  <td className="px-3 py-1.5 text-right">{r.augmented ? formatNumber(r.augmented) : '—'}</td>
                  <td className="px-3 py-1.5 text-right">{formatNumber(r.val)}</td>
                  <td className="px-3 py-1.5 text-right">{formatNumber(r.test)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
