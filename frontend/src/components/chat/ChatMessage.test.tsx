import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { Attribution } from '@/components/Attribution'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { CitationList } from '@/components/chat/CitationList'
import { TooltipProvider } from '@/components/ui/tooltip'

const wrap = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>)

describe('chat Markdown safety', () => {
  it('drops images and opens links safely in a new tab', () => {
    const { container } = wrap(
      <ChatMessage
        id="m1"
        role="assistant"
        content={
          'See ![pixel](https://tracker.example/p.gif) and [Wikipedia](https://en.wikipedia.org/wiki/Koala) [1].'
        }
        sources={[
          { id: 1, title: 'Wikipedia: Koala', url: 'https://en.wikipedia.org/wiki/Koala', kind: 'wikipedia' },
        ]}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    const link = screen.getByRole('link', { name: 'Wikipedia' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: /Source 1/ })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders non-http(s) Markdown links and source URLs as plain text', () => {
    wrap(
      <ChatMessage
        id="m2"
        role="assistant"
        content={'[click me](javascript:alert(1)) [1]'}
        sources={[{ id: 1, title: 'Evil source', url: 'javascript:alert(1)', kind: 'wikipedia' }]}
      />,
    )
    expect(screen.queryByRole('link', { name: 'click me' })).toBeNull()
    expect(screen.getByText('click me')).toBeInTheDocument()
    // the citation chip falls back to the in-page anchor
    expect(screen.getByRole('link', { name: /Source 1/ }).getAttribute('href')).toBe('#cite-m2-1')
  })
})

describe('URL validation in credits and citations', () => {
  it('CitationList links only http(s) URLs', () => {
    wrap(
      <CitationList
        scope="s"
        sources={[
          { id: 1, title: 'Good', url: 'https://www.inaturalist.org/taxa/1', kind: 'inaturalist' },
          { id: 2, title: 'Bad', url: 'data:text/html,<b>x</b>', kind: 'wikipedia' },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: /Good/ })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByRole('link', { name: /Bad/ })).toBeNull()
    expect(screen.getByText('Bad')).toBeInTheDocument()
  })

  it('Attribution renders non-http(s) licence/source URLs as text and can mark resized copies', () => {
    wrap(
      <Attribution
        resized
        image={{
          artist: 'A. Photographer',
          license: 'CC BY-SA 4.0',
          license_url: 'javascript:alert(1)',
          source_url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
          provider: 'Wikimedia Commons',
        }}
      />,
    )
    expect(screen.getByRole('link', { name: 'A. Photographer' })).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:X.jpg',
    )
    expect(screen.queryByRole('link', { name: 'CC BY-SA 4.0' })).toBeNull()
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument()
    expect(screen.getByText(/resized/)).toBeInTheDocument()
  })
})
