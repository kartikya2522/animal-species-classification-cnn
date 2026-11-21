import { describe, expect, it } from 'vitest'

import fixture from '@/fixtures/metrics.json'
import type { FigureInfo, MetricsResponse, ModelMetrics } from '@/lib/api'
import {
  bestByColumn,
  buildClassRows,
  buildComparisonRows,
  buildCurves,
  COLUMNS,
  describeFigure,
  formatCell,
  groupFigures,
  hardForAll,
  missingNotes,
  sharedDomain,
  sortClassRows,
  type ComparisonRow,
} from '@/lib/research'

const metrics = fixture as unknown as MetricsResponse
const col = (key: string) => COLUMNS.find((c) => c.key === key)!
const byId = (rows: ComparisonRow[], id: string) => rows.find((r) => r.id === id)!

describe('buildComparisonRows', () => {
  const rows = buildComparisonRows(metrics)

  it('orders the four models with ResNet50 first and marks EfficientNetV2-S as deployed', () => {
  expect(rows.map((r) => r.id)).toEqual(['resnet50', 'efficientnetv2_s', 'convnext_tiny', 'swin_tiny'])
  expect(rows.filter((r) => r.deployed).map((r) => r.id)).toEqual(['efficientnetv2_s'])
  })

  it('uses the reported test metrics (shared test set, docs/model_comparison.md)', () => {
    const r = byId(rows, 'resnet50')
    expect(formatCell(col('accuracy'), r.cells.accuracy)).toBe('0.7992')
    expect(formatCell(col('f1'), r.cells.f1)).toBe('0.7209')
    expect(formatCell(col('auc'), r.cells.auc)).toBe('0.9929')
    expect(r.cells.accuracy.origin).toBe('reported')
    expect(formatCell(col('accuracy'), byId(rows, 'efficientnetv2_s').cells.accuracy)).toBe('0.8321')
  })

  it("derives ConvNeXt-Tiny's macro P/R/F1 from its per-class report, matching the write-up", () => {
    const c = byId(rows, 'convnext_tiny').cells
    expect(c.precision).toMatchObject({ origin: 'derived' })
    expect(c.precision.value!.toFixed(4)).toBe('0.7681')
    expect(c.recall.value!.toFixed(4)).toBe('0.7595')
    expect(c.f1.value!.toFixed(4)).toBe('0.7403')
  })

  it('derives per-image inference time from total test-evaluation time when not reported', () => {
    expect(byId(rows, 'resnet50').cells.inferenceMs.value!.toFixed(2)).toBe('7.19')
    expect(byId(rows, 'convnext_tiny').cells.inferenceMs.value!.toFixed(2)).toBe('6.78')
    expect(byId(rows, 'swin_tiny').cells.inferenceMs).toEqual({ value: 6.451, origin: 'reported' })
  })

  it('leaves blank cells blank and explains them', () => {
    const auc = byId(rows, 'convnext_tiny').cells.auc
    expect(auc).toEqual({ value: null, origin: 'missing' })
    expect(formatCell(col('auc'), auc)).toBe('—')
    const notes = missingNotes(rows)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/^ConvNeXt-Tiny, AUC: its run did not compute ROC\/AUC/)
  })

  it('records the training device from hparams', () => {
    expect(byId(rows, 'resnet50').device).toBe('mps')
    expect(byId(rows, 'convnext_tiny').device).toBe('cuda')
    expect(byId(rows, 'swin_tiny').device).toBeNull()
  })
})

describe('bestByColumn', () => {
  it('marks EfficientNetV2-S best on every column, using "lower is better" where it applies', () => {
    const best = bestByColumn(buildComparisonRows(metrics))
    for (const c of COLUMNS) expect(best[c.key]).toEqual(['efficientnetv2_s'])
  })

  const cell = (value: number | null) => ({ value, origin: value == null ? 'missing' : 'reported' }) as const
  const row = (id: string, accuracy: number | null, params: number | null): ComparisonRow => ({
    id,
    name: id,
    role: '',
    deployed: false,
    device: null,
    cells: {
      accuracy: cell(accuracy),
      precision: cell(null),
      recall: cell(null),
      f1: cell(null),
      auc: cell(accuracy == null ? null : 0.9),
      params: cell(params),
      trainMinutes: cell(null),
      inferenceMs: cell(null),
    },
  })

  it('ties values that print the same, skips blanks, and marks nothing with fewer than two values', () => {
    const best = bestByColumn([row('a', 0.80001, 2e7), row('b', 0.79998, 1e7), row('c', null, 3e7)])
    expect(best.accuracy).toEqual(['a', 'b'])
    expect(best.params).toEqual(['b'])
    expect(best.precision).toEqual([])
  })
})

describe('training curves', () => {
  const curves = buildCurves(metrics)

  it('builds one series per model with 12 epochs and the best-validation epoch', () => {
    expect(curves.map((c) => [c.id, c.points.length, c.bestEpoch])).toEqual([
      ['resnet50', 12, 1],
      ['efficientnetv2_s', 12, 2],
      ['convnext_tiny', 12, 5],
      ['swin_tiny', 12, 5],
    ])
  })

  it('agrees with the best epoch reported in the summaries', () => {
    for (const c of curves) {
      const reported = metrics.models[c.id]!.summary.best_epoch
      if (reported != null) expect(c.bestEpoch).toBe(reported)
    }
  })

  it('shares one snapped y-domain across the panels', () => {
    expect(sharedDomain(curves, ['trainAcc', 'valAcc'], 0.05)).toEqual([0.7, 1])
    expect(sharedDomain(curves, ['trainLoss', 'valLoss'], 0.2)).toEqual([0, 1.2])
  })
})

describe('per-class rows', () => {
  const resnet = metrics.models.resnet50 as ModelMetrics
  const convnext = metrics.models.convnext_tiny as ModelMetrics
  const rows = buildClassRows(resnet, convnext)

  it('has all 80 classes with the comparison model alongside', () => {
    expect(rows).toHaveLength(80)
    expect(rows.find((r) => r.label === 'Red panda')).toMatchObject({ compare: 1 })
  })

  it('sorts hardest first, easiest first, or by name', () => {
    expect(
      sortClassRows(rows, 'accuracy-asc')
        .slice(0, 2)
        .map((r) => r.label),
    ).toEqual(['Squid', 'Tick'])
    expect(sortClassRows(rows, 'accuracy-desc')[0]!.accuracy).toBe(1)
    expect(sortClassRows(rows, 'label')[0]!.label).toBe('Bear')
  })

  it('returns no rows for a model without per-class data', () => {
    expect(buildClassRows(metrics.models.swin_tiny)).toEqual([])
  })

  it('lists classes that every model with per-class data finds hard', () => {
    const models = Object.values(metrics.models) as ModelMetrics[]
    const hard = hardForAll(models, 0.35)
    expect(hard).toEqual(expect.arrayContaining(['Squid', 'Turtle', 'Seahorse', 'Tick']))
    expect(hard).not.toContain('Leopard') // hard for ResNet50 only
    expect(hardForAll([resnet], 0.35)).toEqual([])
  })
})

describe('figures', () => {
  const fig = (name: string, model: string | null): FigureInfo => ({
    name,
    url: `/api/figures/${name}`,
    model,
    size_bytes: 1,
  })
  const names = { resnet50: 'ResNet50', swin_tiny: 'Swin-Tiny' }

  it('captions figures by kind and model', () => {
    expect(describeFigure(fig('resnet50_roc_auc.png', 'resnet50'), names)).toMatchObject({
      group: 'roc',
      title: 'ResNet50: ROC curves',
    })
    expect(describeFigure(fig('swin_tiny_confusion_matrix_normalized.png', 'swin_tiny'), names).group).toBe(
      'confusion',
    )
    expect(describeFigure(fig('class_distribution.png', null), names).group).toBe('dataset')
    expect(describeFigure(fig('something_new.png', null), names)).toMatchObject({
      group: 'other',
      title: 'Something new',
    })
  })

  it('groups in a fixed order and drops empty groups', () => {
    const groups = groupFigures(
      [
        fig('swin_tiny_roc_auc.png', 'swin_tiny'),
        fig('resnet50_roc_auc.png', 'resnet50'),
        fig('class_distribution.png', null),
      ],
      names,
    )
    expect(groups.map((g) => g.id)).toEqual(['dataset', 'roc'])
    expect(groups[1]!.items.map((f) => f.model)).toEqual(['resnet50', 'swin_tiny'])
  })
})
