import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_DESCRIPTION, pageTitle, usePageMeta } from '@/lib/page-meta'

function Probe({ title, description }: { title: string | null; description?: string }) {
  usePageMeta(title, description)
  return null
}

describe('usePageMeta', () => {
  it('formats titles with the site name', () => {
    expect(pageTitle('Research')).toBe('Research · WildLens')
    expect(pageTitle(null)).toBe('WildLens')
  })

  it('sets document.title and the meta description, falling back to the default', () => {
    const { rerender } = render(<Probe title="About" description="About the project." />)
    expect(document.title).toBe('About · WildLens')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'About the project.',
    )
    rerender(<Probe title={null} />)
    expect(document.title).toBe('WildLens')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      DEFAULT_DESCRIPTION,
    )
  })
})
