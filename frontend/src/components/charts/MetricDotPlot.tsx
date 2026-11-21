import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'

import { modelColor, type ColumnKey, type ComparisonRow } from '@/lib/research'

const METRICS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'precision', label: 'Precision (macro)' },
  { key: 'recall', label: 'Recall (macro)' },
  { key: 'f1', label: 'F1-score (macro)' },
]

const tick = { fill: 'rgb(var(--fg-muted))', fontSize: 12, fontFamily: 'Inter Variable, sans-serif' }

interface Point {
  x: number
  y: number
  metric: string
  model: string
  id: string
}

function DotTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  return (
    <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-caption shadow-overlay">
      <p className="flex items-center gap-2 font-medium text-fg">
        <span className="size-2 rounded-full" style={{ background: modelColor(d.id) }} aria-hidden="true" />
        {d.model}
      </p>
      <p className="tabular text-fg-secondary">
        {d.metric} {d.x.toFixed(4)}
      </p>
    </div>
  )
}

/**
 * Dot plot of the four classification metrics per model. Dots (not bars) because the values sit
 * in a narrow band and bars would need a truncated axis. Models are offset vertically within each
 * metric row so close values never hide each other. AUC is in the table (different scale).
 */
export function MetricDotPlot({ rows, describedBy }: { rows: ComparisonRow[]; describedBy?: string }) {
  const n = rows.length
  const series = rows.map((r, mi) => ({
    row: r,
    points: METRICS.flatMap((m, i) => {
      const v = r.cells[m.key].value
      return v == null
        ? []
        : [{ x: v, y: i + (mi - (n - 1) / 2) * 0.13, metric: m.label, model: r.name, id: r.id }]
    }),
  }))
  const values = series.flatMap((s) => s.points.map((p) => p.x))
  const lo = Math.floor((Math.min(...values) - 0.005) * 50) / 50
  const hi = Math.ceil((Math.max(...values) + 0.005) * 50) / 50
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += 0.02) ticks.push(Number(t.toFixed(2)))

  return (
    <figure aria-describedby={describedBy}>
      <ul className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-caption text-fg-secondary">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ background: modelColor(r.id) }}
            />
            {r.name}
          </li>
        ))}
      </ul>
      <div
        role="img"
        aria-label="Dot plot of accuracy and macro precision, recall and F1 for each model; values are listed in the comparison table."
      >
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="rgb(var(--chart-grid))" strokeDasharray="2 4" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[lo, hi]}
              ticks={ticks}
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={tick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[-0.5, METRICS.length - 0.5]}
              ticks={METRICS.map((_, i) => i)}
              tickFormatter={(v: number) => METRICS[Math.round(v)]?.label ?? ''}
              reversed
              tick={{ ...tick, fill: 'rgb(var(--fg-secondary))', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={128}
            />
            <Tooltip cursor={false} content={<DotTooltip />} />
            {series.map(({ row, points }) => (
              <Scatter
                key={row.id}
                name={row.name}
                data={points}
                fill={modelColor(row.id)}
                stroke="rgb(var(--surface-raised))"
                strokeWidth={2}
                isAnimationActive={false}
                shape={(props: { cx?: number; cy?: number }) => (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={6}
                    fill={modelColor(row.id)}
                    stroke="rgb(var(--surface-raised))"
                    strokeWidth={2}
                  />
                )}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
