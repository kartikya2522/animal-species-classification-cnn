import { BookOpen, RotateCcw, SquarePen, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { Attribution } from '@/components/Attribution'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/button'
import {
  chatStore,
  displayContent,
  resetChat,
  retryChat,
  sendChat,
  setChatContext,
  STARTERS,
  stopChat,
  type ChatMsg,
} from '@/lib/chat-session'
import { parseHandoff, suggestedQuestion } from '@/lib/handoff'
import { speciesPhotoUrl, useSpeciesImages, useSpeciesList } from '@/lib/species'
import { createStore } from '@/lib/store'
import { usePageMeta } from '@/lib/page-meta'

/** Handoffs already applied this session, so returning to /ask does not re-fill the composer. */
const applied = new Set<string>()
/** Pre-filled composer text from the latest handoff (external store: survives route changes). */
const prefillStore = createStore<{ key: string; text: string }>({ key: 'empty', text: '' })

export default function AskPage() {
  usePageMeta(
    'Field Guide',
    'Ask about any animal. Answers are grounded in Wikipedia, Wikidata and iNaturalist and cite their sources.',
  )
  const { messages, context, busy } = chatStore.use()
  const location = useLocation()
  const prefill = prefillStore.use()

  useEffect(() => {
    const h = parseHandoff(location.search)
    if (!h || applied.has(location.search)) return
    applied.add(location.search)
    setChatContext({ slug: h.slug, name: h.name })
    prefillStore.set({ key: location.search, text: suggestedQuestion(h) })
  }, [location.search])

  const empty = messages.length === 0

  return (
    <Container width="content" className="grid grid-cols-12 gap-12 py-10">
      <aside className="col-span-3">
        <div className="sticky top-24 space-y-8">
          <div>
            <p className="type-overline mb-4 flex items-center gap-3">
              <span aria-hidden="true" className="h-px w-8 bg-accent" />
              Field Guide
            </p>
            <h1 className="type-h2">Ask about any animal</h1>
            <p className="mt-4 text-small text-fg-secondary">
              Answers are grounded in Wikipedia, Wikidata, iNaturalist and the WildLens knowledge base, with
              every claim numbered to its source. Not limited to the 80 classes.
            </p>
          </div>
          {context && <ContextCard slug={context.slug} name={context.name} />}
          <div className="space-y-3 border-t border-border pt-6">
            <Button variant="secondary" size="sm" onClick={resetChat} disabled={empty && !busy}>
              <SquarePen /> New conversation
            </Button>
            <p className="text-caption text-fg-muted">
              The conversation stays in this tab until you reload. Without a language-model key the guide
              gives a clearly labelled retrieval-only answer.
            </p>
          </div>
        </div>
      </aside>

      <section
        className="col-span-9 flex h-[calc(100vh-4rem-5rem)] min-h-[34rem] flex-col"
        aria-label="Conversation"
      >
        <MessageList messages={messages} />
        {empty && (
          <div className="mb-6">
            <p className="type-overline mb-3 !text-fg-muted">Try asking</p>
          </div>
        )}
        <ChatComposer
          key={prefill.key}
          initialValue={prefill.text}
          autoFocus={Boolean(prefill.text)}
          onSend={(t) => void sendChat(t)}
          onStop={stopChat}
          busy={busy}
          suggestions={empty ? STARTERS : []}
          className="shrink-0"
        />
      </section>
    </Container>
  )
}

function MessageList({ messages }: { messages: ChatMsg[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const last = messages[messages.length - 1]

  useLayoutEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, last?.content, last?.status])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-end pb-8">
        <div className="max-w-xl">
          <BookOpen className="mb-5 size-7 text-stone" strokeWidth={1} aria-hidden="true" />
          <p className="font-serif text-h3 text-fg">What would you like to know?</p>
          <p className="mt-3 text-small text-fg-muted">
            Habitat, diet, behaviour, conservation status, how the model works. Answers about animals outside
            the atlas take a few seconds longer while sources are looked up.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      className="-mr-4 flex-1 space-y-8 overflow-y-auto pb-8 pr-4"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      data-testid="chat-log"
    >
      {messages.map((m, i) => (
        <div key={m.id}>
          <ChatMessage
            id={m.id}
            role={m.role}
            content={displayContent(m)}
            status={m.status === 'stopped' ? 'done' : m.status}
            sources={m.sources}
            provider={m.provider}
            model={m.model}
            errorMessage={m.error}
          />
          {m.status === 'stopped' && <p className="mt-2 text-caption text-fg-muted">Stopped.</p>}
          {i === messages.length - 1 &&
            m.role === 'assistant' &&
            (m.status === 'error' || m.status === 'stopped') && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => void retryChat()}
                disabled={m.status === 'error' && m.retryable === false}
              >
                <RotateCcw /> Retry
              </Button>
            )}
        </div>
      ))}
    </div>
  )
}

function ContextCard({ slug, name }: { slug: string; name: string }) {
  const { data: list } = useSpeciesList()
  const { data: local } = useSpeciesImages()
  const row = list?.species.find((s) => s.slug === slug)
  const src = row ? speciesPhotoUrl(slug, 'card', row.image, local) : null
  return (
    <div className="rounded border border-border bg-surface p-4" data-testid="chat-context">
      <div className="flex items-start justify-between gap-3">
        <p className="type-overline !text-fg-muted">Context</p>
        <button
          type="button"
          onClick={() => setChatContext(null)}
          className="-m-1 rounded-sm p-1 text-fg-muted hover:text-fg"
          aria-label="Remove species context"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {src && <img src={src} alt="" className="size-12 shrink-0 rounded-sm object-cover" />}
        <div className="min-w-0">
          <Link
            to={`/species/${slug}`}
            className="block truncate font-serif text-h4 leading-tight text-fg hover:text-accent-text"
          >
            {row?.common_name ?? name}
          </Link>
          <p className="text-caption text-fg-muted">Follow-up questions are about this animal.</p>
        </div>
      </div>
      {src && row?.image && <Attribution image={row.image} resized className="mt-3 truncate" />}
    </div>
  )
}
