import { ArrowUpRight } from 'lucide-react'

import type { ChatSource } from '@/lib/api'
import { citationAnchor } from '@/lib/citations'
import { safeHttpUrl } from '@/lib/url'
import { cn } from '@/lib/utils'

const KIND_LABEL: Record<string, string> = {
  wikipedia: 'Wikipedia',
  inaturalist: 'iNaturalist',
  wikidata: 'Wikidata',
  kb: 'WildLens knowledge base',
  project: 'WildLens project',
}

interface CitationListProps {
  sources: ChatSource[]
  /** Unique per message, used for in-page anchors from citation chips. */
  scope: string
  className?: string
}

export function CitationList({ sources, scope, className }: CitationListProps) {
  if (!sources.length) return null
  return (
    <div className={cn('border-t border-border pt-4', className)}>
      <p className="type-overline mb-3 !text-fg-muted">Sources</p>
      <ol className="space-y-2">
        {sources.map((s) => {
          const url = safeHttpUrl(s.url)
          return (
            <li
              key={s.id}
              id={citationAnchor(scope, s.id)}
              className="flex items-baseline gap-3 text-small scroll-mt-24"
            >
              <span className="tabular w-5 shrink-0 font-mono text-caption text-fg-muted">[{s.id}]</span>
              <span className="min-w-0">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link inline-flex items-baseline gap-1"
                  >
                    {s.title}
                    <ArrowUpRight
                      className="size-3 self-center text-fg-muted"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="text-fg">{s.title}</span>
                )}
                <span className="ml-2 text-caption text-fg-muted">{KIND_LABEL[s.kind] ?? s.kind}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
