import { describe, expect, it } from 'vitest'

import { DOWNSCALE_ABOVE_PIXELS, MAX_IMAGE_PIXELS, planDecode } from '@/lib/inference/image'

describe('planDecode', () => {
  it('keeps normal photos at full size (exact parity with the server)', () => {
    expect(planDecode(4032, 3024)).toEqual({ action: 'full', width: 4032, height: 3024 })
    expect(planDecode(224, 224)).toEqual({ action: 'full', width: 224, height: 224 })
  })

  it('scales very large photos down below the threshold, keeping the aspect ratio', () => {
    const plan = planDecode(8000, 5000) // 40 MP
    expect(plan.action).toBe('downscale')
    if (plan.action !== 'downscale') return
    expect(plan.width * plan.height).toBeLessThanOrEqual(DOWNSCALE_ABOVE_PIXELS)
    expect(plan.width / plan.height).toBeCloseTo(1.6, 2)
  })

  it('rejects images above the backend pixel limit with a clear message', () => {
    const plan = planDecode(10000, 6000) // 60 MP
    expect(plan.action).toBe('reject')
    if (plan.action === 'reject') expect(plan.message).toMatch(/too large .*60 megapixels.*limit is 50 MP/)
    expect(MAX_IMAGE_PIXELS).toBe(50_000_000)
    expect(planDecode(0, 10).action).toBe('reject')
  })
})
