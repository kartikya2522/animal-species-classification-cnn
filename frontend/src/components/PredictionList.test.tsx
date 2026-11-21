import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PredictionList } from '@/components/PredictionList'
import type { Prediction } from '@/lib/api'

const confident: Prediction[] = [
  { label: 'Red panda', index: 54, probability: 0.975 },
  { label: 'Panda', index: 46, probability: 0.0017 },
  { label: 'Monkey', index: 39, probability: 0.0012 },
]

const uncertain: Prediction[] = [
  { label: 'Fox', index: 18, probability: 0.31 },
  { label: 'Red panda', index: 54, probability: 0.22 },
  { label: 'Raccoon', index: 55, probability: 0.14 },
  { label: 'Squirrel', index: 68, probability: 0.08 },
  { label: 'Dog', index: 14, probability: 0.05 },
]

describe('PredictionList', () => {
  it('emphasises the top-1 prediction and lists the rest', () => {
    render(<PredictionList predictions={confident} />)
    expect(screen.getByText('Most likely')).toBeInTheDocument()
    expect(screen.getByText('97.5%')).toBeInTheDocument()
    expect(screen.queryByText(/low confidence/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('meter')).toHaveLength(3)
    expect(screen.getByRole('meter', { name: 'Red panda confidence' })).toHaveAttribute(
      'aria-valuenow',
      '97.5',
    )
  })

  it('shows the low-confidence warning with the threshold and labels the top result as the closest match', () => {
    render(<PredictionList predictions={uncertain} lowConfidence threshold={0.5} />)
    const warning = screen.getByRole('status')
    expect(warning).toHaveTextContent(/low confidence/i)
    expect(warning).toHaveTextContent('50%')
    expect(warning).toHaveTextContent(/may not show one of the 80 species/i)
    expect(screen.getByText('Closest match')).toBeInTheDocument()
    expect(screen.queryByText('Most likely')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Other candidates' }).children).toHaveLength(4)
  })

  it('links rows to species pages when slugs and a link renderer are given', () => {
    render(
      <PredictionList
        predictions={confident}
        slugs={{ 'Red panda': 'red-panda', Panda: 'panda' }}
        renderLink={(slug, children) => <a href={`/species/${slug}`}>{children}</a>}
      />,
    )
    expect(screen.getByRole('link', { name: /red panda/i })).toHaveAttribute('href', '/species/red-panda')
    expect(screen.getByRole('link', { name: 'Panda' })).toHaveAttribute('href', '/species/panda')
    expect(screen.queryByRole('link', { name: 'Monkey' })).not.toBeInTheDocument()
  })
})
