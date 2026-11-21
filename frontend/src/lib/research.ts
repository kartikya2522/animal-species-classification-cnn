/**
 * Shapes `/api/metrics` and `/api/figures` for the Research page: comparison rows with the best
 * value per column, training-curve series, per-class rows and figure captions. Pure functions,
 * unit-tested in research.test.ts.
 *
 * Values come straight from the results files. Two gaps are filled by derivation, exactly as
 * docs/model_comparison.md does, and flagged as such: ConvNeXt-Tiny's macro precision/recall/F1
 * (mean of its per-class report) and the per-image inference time for runs that only record a
 * total test-evaluation time (that time ÷ test images).
 */
import type { FigureInfo, MetricsResponse, ModelMetrics } from '@/lib/api'
import { DEPLOYED_MODEL, MODEL_ORDER, MODEL_ROLES } from '@/content/study'

/* ------------------------------------------------------------------ comparison table */

export type ColumnKey =
  'accuracy' | 'precision' | 'recall' | 'f1' | 'auc' | 'params' | 'trainMinutes' | 'inferenceMs'

export interface Column {
  key: ColumnKey
  label: string
  short: string
  better: 'higher' | 'lower'
  kind: 'ratio' | 'count' | 'minutes' | 'ms'
}

export const COLUMNS: Column[] = [
  { key: 'accuracy', label: 'Accuracy', short: 'Accuracy', better: 'higher', kind: 'ratio' },
  { key: 'precision', label: 'Precision (macro)', short: 'Precision', better: 'higher', kind: 'ratio' },
  { key: 'recall', label: 'Recall (macro)', short: 'Recall', better: 'higher', kind: 'ratio' },
  { key: 'f1', label: 'F1-score (macro)', short: 'F1', better: 'higher', kind: 'ratio' },
  { key: 'auc', label: 'AUC (macro, one-vs-rest)', short: 'AUC', better: 'higher', kind: 'ratio' },
  { key: 'params', label: 'Parameters', short: 'Params', better: 'lower', kind: 'count' },
  { key: 'trainMinutes', label: 'Training time', short: 'Training', better: 'lower', kind: 'minutes' },
  { key: 'inferenceMs', label: 'Inference / image', short: 'Inference', better: 'lower', kind: 'ms' },
]

export interface Cell {
  value: number | null
  /** `derived` = computed from other fields of the same results files (see module comment). */
  origin: 'reported' | 'derived' | 'missing'
}

export interface ComparisonRow {
  id: string
  name: string
  role: string
  deployed: boolean
  /** Training device recorded in the run's hparams (e.g. `mps`, `cuda`), if any. */
  device: string | null
  cells: Record<ColumnKey, Cell>
}

const reported = (value: number | null | undefined): Cell =>
  value == null || Number.isNaN(value) ? { value: null, origin: 'missing' } : { value, origin: 'reported' }

const derived = (value: number | null): Cell =>
  value == null || Number.isNaN(value) ? { value: null, origin: 'missing' } : { value, origin: 'derived' }

function meanOf(
  rows: ModelMetrics['per_class_prf'],
  key: 'precision' | 'recall' | 'f1_score',
): number | null {
  if (!rows?.length) return null
  let sum = 0
  for (const r of rows) {
    const v = r[key]
    if (typeof v !== 'number' || Number.isNaN(v)) return null
    sum += v
  }
  return sum / rows.length
}

/** Number of test images: reported, else the per-class support total. */
export function testImages(m: ModelMetrics): number | null {
  if (m.summary.test_samples) return m.summary.test_samples
  const rows = m.per_class_prf
  if (!rows?.length) return null
  const total = rows.reduce((s, r) => s + (typeof r.support === 'number' ? r.support : 0), 0)
  return total > 0 ? total : null
}

function numberField(raw: Record<string, unknown>, key: string): number | null {
  for (const file of Object.values(raw)) {
    if (file && typeof file === 'object' && key in file) {
      const v = (file as Record<string, unknown>)[key]
      if (typeof v === 'number') return v
    }
  }
  return null
}

function inferenceCell(m: ModelMetrics): Cell {
  if (m.summary.avg_inference_ms_per_image != null) return reported(m.summary.avg_inference_ms_per_image)
  const evalSeconds = numberField(m.raw ?? {}, 'test_eval_time_s')
  const n = testImages(m)
  return derived(evalSeconds != null && n ? (evalSeconds * 1000) / n : null)
}

function prfCell(summaryValue: number | null, m: ModelMetrics, key: 'precision' | 'recall' | 'f1_score') {
  return summaryValue != null ? reported(summaryValue) : derived(meanOf(m.per_class_prf, key))
}

export function orderModels(models: Record<string, ModelMetrics>): ModelMetrics[] {
  const known = MODEL_ORDER.filter((id) => models[id]).map((id) => models[id] as ModelMetrics)
  const extra = Object.values(models)
    .filter((m) => !(MODEL_ORDER as readonly string[]).includes(m.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
  return [...known, ...extra]
}

export function buildComparisonRows(metrics: MetricsResponse): ComparisonRow[] {
  return orderModels(metrics.models).map((m) => {
    const s = m.summary
    const device = typeof m.hparams?.device === 'string' ? m.hparams.device : null
    return {
      id: m.id,
      name: m.display_name,
      role: MODEL_ROLES[m.id] ?? '',
      deployed: m.id === DEPLOYED_MODEL,
      device,
      cells: {
        accuracy: reported(s.test_accuracy),
        precision: prfCell(s.macro_precision, m, 'precision'),
        recall: prfCell(s.macro_recall, m, 'recall'),
        f1: prfCell(s.macro_f1, m, 'f1_score'),
        auc: reported(s.macro_roc_auc),
        params: reported(s.total_params),
        trainMinutes: reported(s.train_time_minutes),
        inferenceMs: inferenceCell(m),
      },
    }
  })
}

/**
 * Ids of the best model(s) per column, compared at display precision (4 decimals for ratios,
 * 2 for times) so values that print the same are tied. Columns where fewer than two models have a
 * value get no mark.
 */
export function bestByColumn(rows: ComparisonRow[]): Record<ColumnKey, string[]> {
  const out = {} as Record<ColumnKey, string[]>
  for (const col of COLUMNS) {
    const digits = col.kind === 'ratio' ? 4 : col.kind === 'count' ? 0 : 2
    const vals = rows
      .map((r) => ({ id: r.id, v: r.cells[col.key].value }))
      .filter((x): x is { id: string; v: number } => x.v != null)
      .map((x) => ({ id: x.id, v: Number(x.v.toFixed(digits)) }))
    if (vals.length < 2) {
      out[col.key] = []
      continue
    }
    const target =
      col.better === 'higher' ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v))
    out[col.key] = vals.filter((x) => x.v === target).map((x) => x.id)
  }
  return out
}

export function formatCell(col: Column, cell: Cell): string {
  const v = cell.value
  if (v == null) return '—'
  switch (col.kind) {
    case 'ratio':
      return v.toFixed(4)
    case 'count':
      return `${(v / 1e6).toFixed(1)} M`
    case 'minutes':
      return `${v.toFixed(1)} min`
    case 'ms':
      return `${v.toFixed(2)} ms`
  }
}

/** Long-form value for screen readers / tooltips. */
export function formatCellLong(col: Column, cell: Cell): string {
  const v = cell.value
  if (v == null) return 'not available'
  if (col.kind === 'count') return `${Math.round(v).toLocaleString('en-GB')} parameters`
  return formatCell(col, cell)
}

/* ------------------------------------------------------------------ training curves */

export interface CurvePoint {
  epoch: number
  trainAcc: number | null
  valAcc: number | null
  trainLoss: number | null
  valLoss: number | null
}

export interface CurveSeries {
  id: string
  name: string
  points: CurvePoint[]
  /** Epoch (1-based) with the highest validation accuracy: the checkpoint that was evaluated. */
  bestEpoch: number | null
}

const at = (xs: Array<number | null> | undefined, i: number) => {
  const v = xs?.[i]
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

export function buildCurves(metrics: MetricsResponse): CurveSeries[] {
  return orderModels(metrics.models)
    .filter((m) => m.history && (m.history.val_acc?.length ?? 0) > 0)
    .map((m) => {
      const h = m.history ?? {}
      const n = Math.max(h.val_acc?.length ?? 0, h.train_acc?.length ?? 0)
      const points: CurvePoint[] = Array.from({ length: n }, (_, i) => ({
        epoch: at(h.epoch, i) ?? i + 1,
        trainAcc: at(h.train_acc, i),
        valAcc: at(h.val_acc, i),
        trainLoss: at(h.train_loss, i),
        valLoss: at(h.val_loss, i),
      }))
      let best: CurvePoint | null = null
      for (const p of points)
        if (p.valAcc != null && (best?.valAcc == null || p.valAcc > best.valAcc)) best = p
      return { id: m.id, name: m.display_name, points, bestEpoch: best?.epoch ?? null }
    })
}

/** Shared y-domain across small multiples, padded and snapped to `step`. */
export function sharedDomain(
  series: CurveSeries[],
  keys: Array<keyof Omit<CurvePoint, 'epoch'>>,
  step: number,
): [number, number] {
  const vals = series
    .flatMap((s) => s.points.flatMap((p) => keys.map((k) => p[k])))
    .filter((v): v is number => v != null)
  if (!vals.length) return [0, 1]
  const lo = Math.floor(Math.min(...vals) / step) * step
  const hi = Math.ceil(Math.max(...vals) / step) * step
  return [Number(lo.toFixed(4)), Number(hi.toFixed(4))]
}

/* ------------------------------------------------------------------ per-class */

export interface ClassRow {
  label: string
  accuracy: number
  /** Second model's accuracy for the same class, if it has per-class data. */
  compare: number | null
}

export function buildClassRows(primary: ModelMetrics | undefined, compare?: ModelMetrics): ClassRow[] {
  const acc = primary?.per_class_accuracy
  if (!acc) return []
  const other = compare?.per_class_accuracy ?? null
  return Object.entries(acc).map(([label, accuracy]) => ({
    label,
    accuracy,
    compare: other?.[label] ?? null,
  }))
}

export type ClassSort = 'accuracy-asc' | 'accuracy-desc' | 'label' | 'compare-asc'

export function sortClassRows(rows: ClassRow[], sort: ClassSort): ClassRow[] {
  const byLabel = (a: ClassRow, b: ClassRow) => a.label.localeCompare(b.label)
  const copy = [...rows]
  switch (sort) {
    case 'label':
      return copy.sort(byLabel)
    case 'accuracy-asc':
      return copy.sort((a, b) => a.accuracy - b.accuracy || byLabel(a, b))
    case 'accuracy-desc':
      return copy.sort((a, b) => b.accuracy - a.accuracy || byLabel(a, b))
    case 'compare-asc':
      return copy.sort((a, b) => (a.compare ?? 2) - (b.compare ?? 2) || byLabel(a, b))
  }
}

/** Classes below `threshold` for every model that has per-class data (at least two models). */
export function hardForAll(models: ModelMetrics[], threshold: number): string[] {
  const withData = models.filter((m) => m.per_class_accuracy)
  if (withData.length < 2) return []
  const first = withData[0]?.per_class_accuracy ?? {}
  return Object.keys(first)
    .filter((label) => withData.every((m) => (m.per_class_accuracy?.[label] ?? 1) < threshold))
    .sort((a, b) => {
      const mean = (l: string) =>
        withData.reduce((s, m) => s + (m.per_class_accuracy?.[l] ?? 0), 0) / withData.length
      return mean(a) - mean(b) || a.localeCompare(b)
    })
}

/* ------------------------------------------------------------------ figures */

export type FigureGroup = 'dataset' | 'confusion' | 'roc' | 'curves' | 'per-class' | 'other'

export const FIGURE_GROUPS: Array<{ id: FigureGroup; label: string }> = [
  { id: 'dataset', label: 'Dataset' },
  { id: 'confusion', label: 'Confusion matrices' },
  { id: 'roc', label: 'ROC curves' },
  { id: 'curves', label: 'Training curves' },
  { id: 'per-class', label: 'Per-class accuracy' },
  { id: 'other', label: 'Other' },
]

export interface FigureItem extends FigureInfo {
  group: FigureGroup
  title: string
  caption: string
}

const DATASET_FIGURES: Record<string, { title: string; caption: string }> = {
  class_distribution: {
    title: 'Class distribution',
    caption:
      'Crops per class, stacked by split (train includes the augmented rare-class copies): the long tail from Butterfly down to Canary and Turtle.',
  },
  augmentation_examples: {
    title: 'Augmentation examples',
    caption:
      'Rare-class crops before and after augmentation (rotation, horizontal flip, zoom, translation, shear; no vertical flip).',
  },
  sample_crops_grid: {
    title: 'Sample crops',
    caption: 'Bounding-box crops resized to 224 × 224, as the models see them.',
  },
}

export function describeFigure(fig: FigureInfo, modelNames: Record<string, string>): FigureItem {
  const stem = fig.name.replace(/\.png$/i, '')
  const ds = DATASET_FIGURES[stem]
  if (ds) return { ...fig, group: 'dataset', ...ds }
  const model = fig.model ? (modelNames[fig.model] ?? fig.model) : null
  const rest = fig.model ? stem.slice(fig.model.length + 1) : stem
  const of = model ? `${model}: ` : ''
  if (rest === 'confusion_matrix')
    return {
      ...fig,
      group: 'confusion',
      title: `${of}confusion matrix`,
      caption: 'Counts of true class (rows) against predicted class (columns) on the 7,576-image test set.',
    }
  if (rest === 'confusion_matrix_normalized')
    return {
      ...fig,
      group: 'confusion',
      title: `${of}confusion matrix, normalised`,
      caption: 'Each row divided by its class size, so rare classes are as visible as common ones.',
    }
  if (rest === 'roc_auc')
    return {
      ...fig,
      group: 'roc',
      title: `${of}ROC curves`,
      caption: 'One-vs-rest ROC curves on the test set; the macro AUC is in the comparison table.',
    }
  if (rest === 'training_curves')
    return {
      ...fig,
      group: 'curves',
      title: `${of}training curves`,
      caption: 'Loss and accuracy per epoch on the training and validation splits.',
    }
  if (rest === 'per_class_accuracy')
    return {
      ...fig,
      group: 'per-class',
      title: `${of}per-class accuracy`,
      caption: 'Test accuracy for each of the 80 classes.',
    }
  const title = stem.replace(/_/g, ' ')
  return { ...fig, group: 'other', title: title.charAt(0).toUpperCase() + title.slice(1), caption: '' }
}

export function groupFigures(figs: FigureInfo[], modelNames: Record<string, string>) {
  const order = new Map<string, number>(MODEL_ORDER.map((id, i) => [id, i]))
  const items = figs
    .map((f) => describeFigure(f, modelNames))
    .sort(
      (a, b) =>
        (order.get(a.model ?? '') ?? 9) - (order.get(b.model ?? '') ?? 9) || a.name.localeCompare(b.name),
    )
  return FIGURE_GROUPS.map((g) => ({ ...g, items: items.filter((f) => f.group === g.id) })).filter(
    (g) => g.items.length > 0,
  )
}

/* ------------------------------------------------------------------ colour */

export { modelColor } from '@/lib/model-colors'

/* ------------------------------------------------------------------ notes for blank cells */

const MISSING_REASON: Partial<Record<ColumnKey, string>> = {
  auc: 'its run did not compute ROC/AUC (no ROC figure or AUC value in its results files)',
  inferenceMs: 'its results files record no inference or test-evaluation time',
  trainMinutes: 'its results files record no training time',
}

/** One sentence per model with blank cells, e.g. "ConvNeXt-Tiny — AUC: its run did not compute …". */
export function missingNotes(rows: ComparisonRow[]): string[] {
  const notes: string[] = []
  for (const r of rows) {
    for (const col of COLUMNS) {
      if (r.cells[col.key].value != null) continue
      notes.push(
        `${r.name}, ${col.short}: ${MISSING_REASON[col.key] ?? 'not recorded in its results files'}.`,
      )
    }
  }
  return notes
}

/** Models with any derived cell, per column (for the † footnote). */
export function derivedCells(rows: ComparisonRow[]): Array<{ model: string; columns: ColumnKey[] }> {
  return rows
    .map((r) => ({
      model: r.name,
      columns: COLUMNS.filter((c) => r.cells[c.key].origin === 'derived').map((c) => c.key),
    }))
    .filter((x) => x.columns.length > 0)
}

/* ------------------------------------------------------------------ devices */

const DEVICE_NAMES: Record<string, string> = { mps: 'Apple MPS', cuda: 'CUDA GPU', cpu: 'CPU' }

export function deviceName(device: string | null): string | null {
  return device ? (DEVICE_NAMES[device] ?? device) : null
}
