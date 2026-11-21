import { describe, expect, it } from 'vitest'

import { safeHttpUrl } from '@/lib/url'

describe('safeHttpUrl', () => {
  it('keeps http and https URLs', () => {
    expect(safeHttpUrl('https://commons.wikimedia.org/wiki/File:X.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/File:X.jpg',
    )
    expect(safeHttpUrl('http://creativecommons.org/publicdomain/zero/1.0/deed.en')).toMatch(/^http:/)
  })

  it('rejects every other scheme and garbage', () => {
    for (const u of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,hi',
      'vbscript:x',
      'ftp://x',
      '/relative',
      '',
      null,
      undefined,
    ])
      expect(safeHttpUrl(u)).toBeNull()
  })
})
