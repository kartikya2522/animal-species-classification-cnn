import { Link } from 'react-router-dom'

import { Container } from '@/components/layout/Container'
import { NAV_ITEMS } from '@/components/layout/nav'
import { Wordmark } from '@/components/layout/Wordmark'
import { REPO_URL } from '@/lib/site'

const SOURCES = [
  {
    name: 'Wikipedia & Wikimedia Commons',
    note: 'Summaries and licensed photographs',
    href: 'https://commons.wikimedia.org/',
  },
  {
    name: 'iNaturalist',
    note: 'Common names, taxa and observation counts',
    href: 'https://www.inaturalist.org/',
  },
  { name: 'GBIF', note: 'Occurrence maps and taxon keys', href: 'https://www.gbif.org/' },
  { name: 'Wikidata', note: 'Scientific names and IUCN status', href: 'https://www.wikidata.org/' },
]

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <Container width="content" className="grid grid-cols-12 gap-10 py-16">
        <div className="col-span-4">
          <Wordmark />
          <p className="mt-4 max-w-xs text-small text-fg-muted">
            Identify an animal from a photograph, see why the model decided, and explore the species it
            belongs to.
          </p>
        </div>
        <nav aria-label="Footer" className="col-span-2">
          <p className="type-overline mb-4 !text-fg-muted">Explore</p>
          <ul className="space-y-2.5 text-small">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="text-fg-secondary transition-colors hover:text-fg">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="col-span-6">
          <p className="type-overline mb-4 !text-fg-muted">Data sources</p>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-4 text-small">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <a href={s.href} target="_blank" rel="noreferrer" className="link font-medium">
                  {s.name}
                </a>
                <p className="mt-0.5 text-caption text-fg-muted">{s.note}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-caption text-fg-muted">
            Photographs are credited individually and used under their Creative Commons or public-domain
            licences.
          </p>
        </div>
      </Container>
      <div className="border-t border-border">
        <Container
          width="content"
          className="flex items-center justify-between py-6 text-caption text-fg-muted"
        >
          <p>WildLens · an animal species classification project (EfficientNetV2-S, 80 classes)</p>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="link text-fg-muted">
            Source code
          </a>
        </Container>
      </div>
    </footer>
  )
}
