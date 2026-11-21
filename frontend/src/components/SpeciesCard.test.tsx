import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SpeciesCard, type SpeciesCardData } from '@/components/SpeciesCard'

const species: SpeciesCardData = {
  slug: 'red-panda',
  common_name: 'Red panda',
  scientific_name: 'Ailurus fulgens',
  is_group: false,
  animal_group: 'Mammal',
  iucn_code: 'EN',
  iucn_label: 'Endangered',
  model_accuracy: 0.9,
  image: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Red_Panda.jpg',
    width: 3900,
    artist: 'Mathias Appel',
    license: 'CC0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source_url: 'https://commons.wikimedia.org/wiki/File:Red_Panda.jpg',
    provider: 'Wikimedia Commons',
  },
}

describe('SpeciesCard as a link', () => {
  it('never nests links: title link (stretched over the card) first, then the credit link', () => {
    const { container } = render(
      <SpeciesCard
        species={species}
        renderLink={(children) => (
          <a href="/species/red-panda" aria-label="Red panda profile">
            {children}
          </a>
        )}
      />,
    )
    expect(container.querySelector('a a')).toBeNull()
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('aria-label') ?? a.textContent)).toEqual([
      'Red panda profile',
      'Mathias Appel',
      'CC0',
    ])
    // DOM order = tab order: the title link comes before the credit links.
    expect(links[0]!.compareDocumentPosition(links[1]!) & Node.DOCUMENT_POSITION_PRECEDING).toBe(0)
    expect(links[0]!.closest('h3')).not.toBeNull()
  })
})
