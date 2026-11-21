import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatPercent } from '@/lib/format'

export interface AccuracyDatum {
  id: string
  name: string
  accuracy: number
}

interface AccuracyBarChartProps {
  data: AccuracyDatum[]
  /** Model id to emphasise (e.g. the served model). */
  highlight?: string
  height?: number
  /** Accessible summary of what the chart shows. */
  title: string
}

const tick = { fill: 'rgb(var(--fg-muted))', fontSize: 12, fontFamily: 'Inter Variable, sans-serif' }

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: AccuracyDatum }>
}) {
  const d = active ? payload?.[0]?.payload : undefined
  if (!d) return null
  return (
    <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-caption shadow-overlay">
      <p className="font-medium text-fg">{d.name}</p>
      <p className="tabular text-fg-secondary">Test accuracy {formatPercent(d.accuracy)}</p>
    </div>
  )
}

/** Single-series horizontal bars; the highlighted model in the lead colour, others in stone. */
export function AccuracyBarChart({ data, highlight, height = 220, title }: AccuracyBarChartProps) {
  return (
    <figure>
      <div
        role="img"
        aria-label={`${title}: ${data.map((d) => `${d.name} ${formatPercent(d.accuracy)}`).join(', ')}`}
      >
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
            barCategoryGap={14}
          >
            <CartesianGrid horizontal={false} stroke="rgb(var(--chart-grid))" strokeDasharray="2 4" />
            <XAxis
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={tick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ ...tick, fill: 'rgb(var(--fg-secondary))', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={124}
            />
            <Tooltip cursor={{ fill: 'rgb(var(--surface-sunken))' }} content={<ChartTooltip />} />
            <Bar dataKey="accuracy" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.id}
                  fill={d.id === highlight ? 'rgb(var(--chart-1))' : 'rgb(var(--chart-3) / 0.55)'}
                />
              ))}
              <LabelList
                dataKey="accuracy"
                position="right"
                formatter={(v: unknown) => formatPercent(Number(v))}
                style={{ ...tick, fill: 'rgb(var(--fg-secondary))', fontVariantNumeric: 'tabular-nums' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
