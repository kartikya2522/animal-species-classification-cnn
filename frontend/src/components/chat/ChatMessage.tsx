import type { ReactNode } from 'react'
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { CitationList } from '@/components/chat/CitationList'
import { ProviderBadge } from '@/components/chat/ProviderBadge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import type { ChatProvider, ChatSource } from '@/lib/api'
import { citationAnchor } from '@/lib/citations'
import { safeHttpUrl } from '@/lib/url'
import { cn } from '@/lib/utils'

export type ChatMessageStatus = 'searching' | 'streaming' | 'done' | 'error'

interface ChatMessageProps {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: ChatMessageStatus
  sources?: ChatSource[]
  provider?: ChatProvider
  model?: string | null
  /** Shown under an errored assistant message. */
  errorMessage?: string
  className?: string
}

const CITE = /\[(\d{1,2})\](?!\()/g

/** Turn "[1]" markers into links Markdown can render; skips code spans. */
function linkCitations(md: string): string {
  return md
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(CITE, (_m, n: string) => `[${n}](cite:${n})`)))
    .join('')
}

function CitationChip({ n, source, scope }: { n: number; source?: ChatSource; scope: string }) {
  const url = safeHttpUrl(source?.url)
  const chip = (
    <a
      href={url ?? `#${citationAnchor(scope, n)}`}
      target={url ? '_blank' : undefined}
      rel={url ? 'noopener noreferrer' : undefined}
      aria-label={source ? `Source ${n}: ${source.title}` : `Source ${n}`}
      className="mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-px items-center justify-center rounded-sm border border-border-strong bg-surface-raised px-1 align-middle font-mono text-[0.6875rem] font-medium text-fg-secondary no-underline transition-colors hover:border-accent hover:text-fg"
    >
      {n}
    </a>
  )
  if (!source) return chip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>{source.title}</TooltipContent>
    </Tooltip>
  )
}

export function ChatMessage({
  id,
  role,
  content,
  status = 'done',
  sources = [],
  provider,
  model,
  errorMessage,
  className,
}: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className={cn('flex justify-end', className)}>
        <div className="max-w-[36rem] rounded-md rounded-br-sm bg-primary/[0.08] px-4 py-3 text-body text-fg">
          <span className="sr-only">You said: </span>
          {content}
        </div>
      </div>
    )
  }

  const byId = new Map(sources.map((s) => [s.id, s]))
  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith('cite:')) {
        const n = Number(href.slice(5))
        return <CitationChip n={n} source={byId.get(n)} scope={id} />
      }
      const url = safeHttpUrl(href)
      if (!url) return <>{children as ReactNode}</>
      return (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {children as ReactNode}
        </a>
      )
    },
  }

  return (
    <article
      className={cn('max-w-[44rem]', className)}
      aria-busy={status === 'searching' || status === 'streaming'}
    >
      <header className="mb-3 flex items-center gap-3">
        <span className="type-overline">Field Guide</span>
        {provider && status !== 'searching' && <ProviderBadge provider={provider} model={model} />}
      </header>

      {status === 'searching' && !content ? (
        <div className="flex items-center gap-3 py-2 text-small text-fg-secondary">
          <Spinner size="sm" label="Searching sources" />
          <span>
            Searching sources<span aria-hidden="true">…</span>
            <span className="ml-2 text-fg-muted">Wikipedia, Wikidata and iNaturalist</span>
          </span>
        </div>
      ) : (
        <div className={cn('prose-field', status === 'streaming' && 'is-streaming')}>
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={components}
            // No images from model output or retrieved text (no tracking pixels / hotlinks).
            disallowedElements={['img']}
            urlTransform={(url) => (url.startsWith('cite:') ? url : defaultUrlTransform(url))}
          >
            {linkCitations(content)}
          </Markdown>
        </div>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-3 text-small text-danger">
          {errorMessage ?? 'The answer was interrupted. Please try again.'}
        </p>
      )}

      {status === 'done' && sources.length > 0 && (
        <CitationList sources={sources} scope={id} className="mt-5" />
      )}
    </article>
  )
}
