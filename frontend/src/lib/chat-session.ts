/**
 * Field Guide conversation state, kept in memory for the session (survives route
 * changes, not reloads). Streams /api/chat and folds SSE events into messages.
 */
import {
  ApiError,
  streamChat,
  type ChatContext,
  type ChatEvent,
  type ChatProvider,
  type ChatRequest,
  type ChatSource,
} from '@/lib/api'
import { createStore } from '@/lib/store'

export type MessageStatus = 'searching' | 'streaming' | 'done' | 'error' | 'stopped'

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: MessageStatus
  sources: ChatSource[]
  provider?: ChatProvider
  model?: string | null
  error?: string
  /** True for errors worth retrying (network, 429, 5xx). */
  retryable?: boolean
}

export interface ChatState {
  messages: ChatMsg[]
  /** Species context from a handoff, sent with every request. */
  context: { slug: string; name: string } | null
  busy: boolean
}

/** Starter questions: a few about the 80 classes, one about an animal outside them (live lookup). */
export const STARTERS = [
  'Where do red pandas live, and why are they endangered?',
  'How fast can a cheetah run?',
  'What is the difference between a sea lion and a harbor seal?',
  'Where do axolotls live in the wild?',
]

/**
 * Messages sent per request (the backend accepts up to 20 and forwards the last 10 to the LLM);
 * older turns are dropped to save LLM tokens on the free tier.
 */
export const MAX_HISTORY = 10
/** Earlier answers are clipped to this many characters in the request (the backend accepts
 * any length for assistant turns, but long answers only cost tokens). */
export const MAX_ASSISTANT_CHARS = 1500

export const chatStore = createStore<ChatState>({ messages: [], context: null, busy: false })

let controller: AbortController | null = null
let seq = 0
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

type Streamer = (req: ChatRequest, signal?: AbortSignal) => AsyncIterable<ChatEvent>
let streamer: Streamer = streamChat

/** Tests swap the network layer. */
export function setChatStreamer(fn: Streamer | null) {
  streamer = fn ?? streamChat
}

function patch(id: string, fn: (m: ChatMsg) => ChatMsg) {
  chatStore.set((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }))
}

export function describeChatError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof ApiError) {
    if (err.status === 429)
      return {
        message:
          'The Field Guide is answering a lot of questions right now (20 per minute per visitor). Wait a few seconds, then retry.',
        retryable: true,
      }
    if (err.status === 413 || err.status === 422)
      return { message: `The question could not be sent: ${err.detail}`, retryable: false }
    if (err.status >= 500)
      return {
        message: 'The WildLens server could not answer. Check that the backend is running, then retry.',
        retryable: true,
      }
    return { message: err.detail || `Request failed (${err.status}).`, retryable: false }
  }
  return {
    message:
      'Could not reach the WildLens server. Check your connection and that the backend is running, then retry.',
    retryable: true,
  }
}

const INLINE_SOURCES = /\n*\*\*Sources\*\*\n[\s\S]*?(?=\n\n_Retrieval-only answer|$)/

/** An earlier answer as request history: inline "Sources" list removed, clipped at a word boundary. */
export function historyContent(content: string, max = MAX_ASSISTANT_CHARS): string {
  const text = content.replace(INLINE_SOURCES, '').trim()
  if (text.length <= max) return text
  let cut = text.slice(0, max - 2)
  const space = cut.lastIndexOf(' ')
  if (space > cut.length - 80) cut = cut.slice(0, space)
  return `${cut.trimEnd()} …`
}

export function buildRequest(messages: ChatMsg[], context: ChatState['context']): ChatRequest {
  const history = messages
    .filter((m) => m.content.trim() && (m.role === 'user' || m.status === 'done' || m.status === 'stopped'))
    .map((m) => ({ role: m.role, content: m.role === 'assistant' ? historyContent(m.content) : m.content }))
    .filter((m) => m.content)
    .slice(-MAX_HISTORY)
  // The request must start with a user turn.
  while (history.length && history[0]?.role !== 'user') history.shift()
  const ctx: ChatContext | undefined = context ? { species_slug: context.slug } : undefined
  return ctx ? { messages: history, context: ctx } : { messages: history }
}

export function setChatContext(context: ChatState['context']) {
  chatStore.set((s) => ({ ...s, context }))
}

export async function sendChat(text: string): Promise<void> {
  const content = text.trim()
  if (!content || chatStore.get().busy) return
  const user: ChatMsg = { id: nextId(), role: 'user', content, status: 'done', sources: [] }
  chatStore.set((s) => ({ ...s, messages: [...s.messages, user] }))
  await answer()
}

/** Re-ask the last user question after a failed answer. */
export async function retryChat(): Promise<void> {
  const s = chatStore.get()
  if (s.busy) return
  const last = s.messages[s.messages.length - 1]
  if (last?.role === 'assistant' && (last.status === 'error' || last.status === 'stopped')) {
    chatStore.set((st) => ({ ...st, messages: st.messages.slice(0, -1) }))
  }
  if (chatStore.get().messages.at(-1)?.role === 'user') await answer()
}

export function stopChat() {
  controller?.abort()
}

export function resetChat() {
  controller?.abort()
  chatStore.set((s) => ({ ...s, messages: [], busy: false }))
}

async function answer(): Promise<void> {
  const { messages, context } = chatStore.get()
  const request = buildRequest(messages, context)
  const id = nextId()
  const reply: ChatMsg = { id, role: 'assistant', content: '', status: 'searching', sources: [] }
  controller = new AbortController()
  const signal = controller.signal
  chatStore.set((s) => ({ ...s, busy: true, messages: [...s.messages, reply] }))
  try {
    for await (const ev of streamer(request, signal)) {
      if (ev.type === 'meta')
        patch(id, (m) => ({ ...m, provider: ev.provider, model: ev.model, sources: ev.sources }))
      else if (ev.type === 'token')
        patch(id, (m) => ({ ...m, status: 'streaming', content: m.content + ev.text }))
      else if (ev.type === 'done')
        patch(id, (m) => ({ ...m, status: 'done', provider: m.provider ?? ev.provider }))
      else if (ev.type === 'error')
        patch(id, (m) => ({ ...m, status: 'error', error: ev.message, retryable: true }))
    }
    // Stream ended without a terminal event (connection dropped).
    patch(id, (m) =>
      m.status === 'searching' || m.status === 'streaming'
        ? { ...m, status: 'error', error: 'The answer was cut off. Please retry.', retryable: true }
        : m,
    )
  } catch (err) {
    if (signal.aborted) {
      patch(id, (m) => ({ ...m, status: 'stopped' }))
    } else {
      const { message, retryable } = describeChatError(err)
      patch(id, (m) => ({ ...m, status: 'error', error: message, retryable }))
    }
  } finally {
    if (controller?.signal === signal) controller = null
    chatStore.set((s) => ({ ...s, busy: false }))
  }
}

/**
 * Text to render for a message. Retrieval-only answers end with an inline "**Sources**" list;
 * the UI already renders those sources as a CitationList under the answer, so the inline copy is
 * dropped (and "sources above" now reads "sources below").
 */
export function displayContent(m: Pick<ChatMsg, 'content' | 'provider' | 'sources'>): string {
  if (m.provider !== 'fallback' || m.sources.length === 0) return m.content
  return m.content
    .replace(/\n*\*\*Sources\*\*\n[\s\S]*?(?=\n\n_Retrieval-only answer|$)/, '')
    .replace('from the sources above', 'from the sources below')
}
