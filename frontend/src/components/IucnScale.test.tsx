import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { IucnScale } from '@/components/IucnScale'

describe('IucnScale', () => {
  it('marks the current category on the LC → EX scale', () => {
    render(<IucnScale code="EN" source="IUCN Red List via Wikidata (P141)" />)
    const scale = screen.getByRole('list', { name: /conservation status scale: endangered/i })
    const items = within(scale).getAllByRole('listitem')
    expect(items.map((li) => li.textContent?.slice(0, 2))).toEqual(['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'])
    const current = items.filter((li) => li.getAttribute('aria-current') === 'true')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Endangered')
    expect(screen.getByTestId('iucn-status')).toHaveTextContent('Endangered')
    expect(screen.getByText(/Source: IUCN Red List via Wikidata/)).toBeInTheDocument()
  })

  it('renders the not-applicable state for groups with no highlighted category', () => {
    render(<IucnScale code={null} label="Not applicable (group)" />)
    expect(screen.getByTestId('iucn-status')).toHaveTextContent('Not applicable (group)')
    const items = screen.getAllByRole('listitem')
    expect(items.some((li) => li.hasAttribute('aria-current'))).toBe(false)
    expect(screen.getByText(/assessed for individual species, not for groups/i)).toBeInTheDocument()
  })

  it('keeps Data Deficient off the scale with an explanatory note', () => {
    render(<IucnScale code="DD" />)
    expect(screen.getByTestId('iucn-status')).toHaveTextContent('Data Deficient')
    expect(screen.getAllByRole('listitem').some((li) => li.hasAttribute('aria-current'))).toBe(false)
    expect(screen.getByText(/not enough information/i)).toBeInTheDocument()
  })
})
