import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, type ExplainResponse } from '@/lib/api'
import explainFixture from '@/fixtures/explain-red-panda.json'
import { ServerInference } from '@/lib/inference/server'

afterEach(() => vi.restoreAllMocks())

describe('ServerInference', () => {
  it('uses a single /api/explain call (no separate predict) and maps its fields', async () => {
    const exp = {
      ...(explainFixture as unknown as ExplainResponse),
      overlay_png: '',
      low_confidence_threshold: 0.5,
    }
    const explain = vi.spyOn(api, 'explain').mockResolvedValue(exp)
    const predict = vi.spyOn(api, 'predict')
    const r = await new ServerInference().identify(new Blob(['x']))
    expect(explain).toHaveBeenCalledTimes(1)
    expect(explain.mock.calls[0]![1]).toMatchObject({ colormap: 'amber' })
    expect(predict).not.toHaveBeenCalled()
    expect(r.predictions).toEqual(exp.predictions.slice(0, 5))
    expect(r.lowConfidence).toBe(exp.low_confidence)
    expect(r.threshold).toBe(0.5)
    expect(r.inferenceMs).toBe(exp.inference_ms)
    expect(r.explainMs).toBe(exp.explain_ms)
    expect(r.image).toEqual({ width: exp.image.width, height: exp.image.height })
    expect(r.heatmapPng).toBe(exp.heatmap_png)
    expect(r.slugs).toEqual(exp.slugs)
  })
})
