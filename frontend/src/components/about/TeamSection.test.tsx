import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TeamSection } from '@/components/about/TeamSection'
import { TEAM } from '@/content/team'

const NAMES = ['Sameer Kadam', 'Kartikya Gawali', 'Yash More', 'Pratik Bhosale']

describe('TeamSection', () => {
  it('lists the four project team members by name only', () => {
    expect(TEAM.map((m) => m.name)).toEqual(NAMES)
    expect(TEAM.every((m) => m.role === undefined && m.link === undefined)).toBe(true)
    render(<TeamSection members={TEAM} />)
    const section = screen.getByTestId('team-section')
    expect(within(section).getByRole('heading', { name: 'Project team' })).toBeInTheDocument()
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(NAMES)
    expect(within(section).queryAllByRole('link')).toHaveLength(0)
  })

  it('renders nothing when the list is empty', () => {
    const { container } = render(<TeamSection members={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an optional role and only http(s) links', () => {
    render(
      <TeamSection
        members={[
          { name: 'A. Person', role: 'Model training', link: 'https://example.org/a' },
          { name: 'B. Person', link: 'javascript:alert(1)' },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'A. Person' })).toHaveAttribute('href', 'https://example.org/a')
    expect(screen.getByText('Model training')).toBeInTheDocument()
    expect(screen.getByText('B. Person').closest('a')).toBeNull()
  })
})
