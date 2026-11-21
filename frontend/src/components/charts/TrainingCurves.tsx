import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { modelColor, sharedDomain, type CurvePoint, type CurveSeries } from '@/lib/research'

export type CurveMetric = 'accuracy' | 'loss'

const KEYS: Record<CurveMetric, { train: keyof CurvePoint; val: keyof CurvePoint; step: number }> = {
  accuracy: { train: 'trainAcc', val: 'valAcc', step: 0.05 },
  loss: { train: 'trainLoss', val: 'valLoss', step: 0.2 },
}

const tick = { fill: 'rgb(var(--fg-muted))', fontSize: 11, fontFamily: 'Inter Variable, sans-serif' }

const fmt = (metric: CurveMetric, v: number | null | undefined) =>
  v == null ? '—' : metric === 'accuracy' ? `${(v * 100).toFixed(1)}%` : v.toFixed(3)

function CurveTooltip({
  active,
  payload,
  label,
  metric,
  color,
}: {
  active?: boolean
  payload?: Array<{ payload: CurvePoint }>
  label?: number
  metric: CurveMetric
  color: string
}) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  const k = KEYS[metric]
  return (
    <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-caption shadow-overlay">
      <p className="font-medium text-fg">Epoch {label}</p>
      <p className="tabular flex items-center gap-2 text-fg-secondary">
        <span className="h-0.5 w-3" style={{ background: color }} aria-hidden="true" />
        Validation {fmt(metric, p[k.val] as number | null)}
      </p>
      <p className="tabular flex items-center gap-2 text-fg-secondary">
        <span className="w-3 border-t border-dashed border-fg-muted" aria-hidden="true" />
        Training {fmt(metric, p[k.train] as number | null)}
      </p>
    </div>
  )
}

/** Small multiples, one panel per model, on a shared y-axis so the panels compare directly. */
export function TrainingCurves({ series, metric }: { series: CurveSeries[]; metric: CurveMetric }) {
  const k = KEYS[metric]
  const domain = sharedDomain(series, [k.train, k.val] as Array<keyof Omit<CurvePoint, 'epoch'>>, k.step)
  const maxEpoch = Math.max(...series.flatMap((s) => s.points.map((p) => p.epoch)))
  const yTicks: number[] = []
  const tickStep = metric === 'accuracy' ? 0.05 : 0.2
  for (let t = domain[0]; t <= domain[1] + 1e-9; t += tickStep) yTicks.push(Number(t.toFixed(2)))

  return (
    <div>
      <div className="mb-4 flex gap-6 text-caption text-fg-secondary">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-5 bg-fg-secondary" aria-hidden="true" />
          Validation (in the model&rsquo;s colour)
        </span>
        <span className="flex items-center gap-2">
          <span className="w-5 border-t-2 border-dashed border-fg-muted" aria-hidden="true" />
          Training
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 border-l border-dotted border-fg-secondary" aria-hidden="true" />
          Best validation epoch (the checkpoint that was tested)
        </span>
      </div>
      <div className="grid grid-cols-4 gap-6">
        {series.map((s) => {
          const color = modelColor(s.id)
          return (
            <figure key={s.id} className="min-w-0">
              <figcaption className="mb-2 flex items-baseline justify-between text-small">
                <span className="font-medium text-fg">{s.name}</span>
                <span className="tabular text-caption text-fg-muted">best epoch {s.bestEpoch ?? '—'}</span>
              </figcaption>
              <div
                role="img"
                aria-label={`${s.name}: ${metric} per epoch. Validation ${s.points.map((p) => fmt(metric, p[k.val] as number | null)).join(', ')}.`}
              >
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={s.points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--chart-grid))" strokeDasharray="2 4" />
                    <XAxis
                      dataKey="epoch"
                      type="number"
                      domain={[1, maxEpoch]}
                      ticks={[1, 4, 8, maxEpoch]}
                      tick={tick}
                      axisLine={{ stroke: 'rgb(var(--border-strong))' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={domain}
                      ticks={yTicks}
                      tickFormatter={(v: number) =>
                        metric === 'accuracy' ? `${Math.round(v * 100)}%` : v.toFixed(1)
                      }
                      tick={tick}
                      axisLine={false}
                      tickLine={false}
                      width={38}
                      allowDataOverflow
                    />
                    {s.bestEpoch != null && (
                      <ReferenceLine
                        x={s.bestEpoch}
                        stroke="rgb(var(--fg-secondary))"
                        strokeDasharray="1 3"
                        ifOverflow="hidden"
                      />
                    )}
                    <Tooltip
                      cursor={{ stroke: 'rgb(var(--border-strong))' }}
                      content={<CurveTooltip metric={metric} color={color} />}
                    />
                    <Line
                      dataKey={k.train}
                      stroke="rgb(var(--fg-muted))"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey={k.val}
                      stroke={color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, stroke: 'rgb(var(--surface-raised))', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
