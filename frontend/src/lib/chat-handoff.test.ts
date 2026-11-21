import { afterEach, describe, expect, it } from 'vitest'

import { ApiError, type ChatEvent, type ChatRequest } from '@/lib/api'
import {
  buildRequest,
  displayContent,
  chatStore,
  historyContent,
  MAX_ASSISTANT_CHARS,
  MAX_HISTORY,
  resetChat,
  retryChat,
  sendChat,
  setChatContext,
  setChatStreamer,
  type ChatMsg,
} from '@/lib/chat-session'
import { askLink, parseHandoff, suggestedQuestion } from '@/lib/handoff'

afterEach(() => {
  setChatStreamer(null)
  resetChat()
  setChatContext(null)
})

describe('handoff links', () => {
  it('round-trips slug, name and origin', () => {
    const link = askLink({ slug: 'red-panda', name: 'Red panda', from: 'identify' })
    expect(link).toBe('/ask?species=red-panda&name=Red+panda&from=identify')
    expect(parseHandoff(link.slice(4))).toEqual({ slug: 'red-panda', name: 'Red panda', from: 'identify' })
  })

  it('rejects malformed slugs and defaults the name', () => {
    expect(parseHandoff('?species=../etc')).toBeNull()
    expect(parseHandoff('?name=Lion')).toBeNull()
    expect(parseHandoff('?species=brown-bear')).toEqual({
      slug: 'brown-bear',
      name: 'brown bear',
      from: undefined,
    })
  })

  it('pre-fills a question that names the animal', () => {
    expect(suggestedQuestion({ slug: 'red-panda', name: 'Red panda', from: 'identify' })).toMatch(
      /top match for my photo was Red panda\./,
    )
    expect(suggestedQuestion({ slug: 'cheetah', name: 'Cheetah', from: 'profile' })).toMatch(/the cheetah/)
  })
})

describe('identify handoff wording', () => {
  it('reads correctly for group and plural labels, with the confidence', () => {
    for (const [slug, name] of [
      ['moths-and-butterflies', 'Moths and butterflies'],
      ['cattle', 'Cattle'],
      ['fish', 'Fish'],
    ] as const) {
      const link = askLink({ slug, name, from: 'identify', probability: 0.874 })
      const h = parseHandoff(link.slice(4))
      expect(h).toEqual({ slug, name, from: 'identify', probability: 0.87 })
      const q = suggestedQuestion(h!)
      expect(q).toBe(
        `The model's top match for my photo was ${name} (87%). Where do they live, and how are they doing in the wild?`,
      )
      expect(q).not.toMatch(/\ba (moths|cattle|fish)\b/i)
    }
  })

  it('hedges when the prediction was low-confidence', () => {
    const link = askLink({
      slug: 'fox',
      name: 'Fox',
      from: 'identify',
      probability: 0.31,
      lowConfidence: true,
    })
    expect(link).toContain('low=1')
    const q = suggestedQuestion(parseHandoff(link.slice(4))!)
    expect(q).toMatch(/^The model wasn't confident about my photo; its best guess was Fox \(31%\)\./)
  })

  it('ignores confidence parameters outside identify handoffs or out of range', () => {
    expect(parseHandoff('?species=fox&name=Fox&p=50&low=1')).toEqual({
      slug: 'fox',
      name: 'Fox',
      from: undefined,
    })
    expect(parseHandoff('?species=fox&name=Fox&from=identify&p=500')?.probability).toBeUndefined()
  })
})

function fakeStream(events: ChatEvent[], seen: ChatRequest[]) {
  return async function* (req: ChatRequest) {
    seen.push(req)
    for (const e of events) yield e
  }
}

describe('chat session', () => {
  it('sends the handed-over species as context with every request', async () => {
    const seen: ChatRequest[] = []
    setChatStreamer(
      fakeStream(
        [
          {
            type: 'meta',
            provider: 'fallback',
            model: null,
            retrieval: 'kb',
            subjects: [],
            sources: [
              {
                id: 1,
                title: 'Wikipedia: Red panda',
                url: 'https://en.wikipedia.org/wiki/Red_panda',
                kind: 'wikipedia',
              },
            ],
            skipped: [],
          },
          { type: 'token', text: 'Red pandas live in ' },
          { type: 'token', text: 'the eastern Himalayas [1].' },
          { type: 'done', provider: 'fallback', finish_reason: 'stop', elapsed_ms: 3 },
        ],
        seen,
      ),
    )
    setChatContext({ slug: 'red-panda', name: 'Red panda' })
    await sendChat('Where do they live?')
    await sendChat('How long do they live?')

    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual({
      messages: [{ role: 'user', content: 'Where do they live?' }],
      context: { species_slug: 'red-panda' },
    })
    expect(seen[1]!.context).toEqual({ species_slug: 'red-panda' })
    expect(seen[1]!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])

    const answer = chatStore.get().messages[1]!
    expect(answer.status).toBe('done')
    expect(answer.provider).toBe('fallback')
    expect(answer.content).toBe('Red pandas live in the eastern Himalayas [1].')
    expect(answer.sources[0]!.title).toBe('Wikipedia: Red panda')
  })

  it('omits context when none is set and trims history to the backend limit', () => {
    const msgs: ChatMsg[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      role: i % 2 ? 'assistant' : 'user',
      content: `m${i}`,
      status: 'done',
      sources: [],
    }))
    const req = buildRequest(msgs, null)
    expect(req.context).toBeUndefined()
    expect(req.messages.length).toBeLessThanOrEqual(MAX_HISTORY)
    expect(req.messages[0]!.role).toBe('user')
  })

  it('strips the inline Sources block and clips long answers in the request history', () => {
    const long =
      'The sea lion is a pinniped. '.repeat(80) +
      '\n\n**Sources**\n\n[1] Wikipedia: Sea lion — https://en.wikipedia.org/wiki/Sea_lion' +
      '\n\n_Retrieval-only answer: no language model is configured._'
    expect(long.length).toBeGreaterThan(2000)
    const msgs: ChatMsg[] = [
      {
        id: 'a',
        role: 'user',
        content: 'What is the difference between a sea lion and a harbor seal?',
        status: 'done',
        sources: [],
      },
      { id: 'b', role: 'assistant', content: long, status: 'done', sources: [], provider: 'fallback' },
      { id: 'c', role: 'user', content: 'Which one is bigger?', status: 'done', sources: [] },
    ]
    const req = buildRequest(msgs, null)
    const prev = req.messages[1]!
    expect(prev.role).toBe('assistant')
    expect(prev.content.length).toBeLessThanOrEqual(MAX_ASSISTANT_CHARS)
    expect(prev.content).not.toContain('**Sources**')
    expect(prev.content.endsWith('…')).toBe(true)
    // Short answers keep their text, minus the sources list.
    expect(
      historyContent('Short answer [1].\n\n**Sources**\n\n[1] Wikipedia: X\n\n_Retrieval-only answer: x._'),
    ).toBe('Short answer [1].\n\n_Retrieval-only answer: x._')
  })

  it('marks 429 as retryable and retry re-asks the same question', async () => {
    const seen: ChatRequest[] = []
    let calls = 0
    setChatStreamer(async function* (req: ChatRequest) {
      seen.push(req)
      calls += 1
      if (calls === 1) throw new ApiError(429, 'Too many requests')
      yield { type: 'token', text: 'ok' } as ChatEvent
      yield { type: 'done', provider: 'fallback', finish_reason: 'stop', elapsed_ms: 1 } as ChatEvent
    })
    await sendChat('Hello')
    let last = chatStore.get().messages.at(-1)!
    expect(last.status).toBe('error')
    expect(last.retryable).toBe(true)
    expect(last.error).toMatch(/20 per minute/)

    await retryChat()
    last = chatStore.get().messages.at(-1)!
    expect(last.status).toBe('done')
    expect(chatStore.get().messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(seen[1]!.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })
})

describe('displayContent', () => {
  it('drops the inline source list of retrieval-only answers', () => {
    const content =
      'Red pandas live in the Himalayas [1].\n\n**Sources**\n\n[1] Wikipedia: Red panda — https://x\n[2] KB\n\n_Retrieval-only answer: no language model is configured, so this was assembled directly from the sources above and may not address every part of your question._'
    const out = displayContent({
      content,
      provider: 'fallback',
      sources: [{ id: 1, title: 't', url: null, kind: 'kb' }],
    })
    expect(out).not.toContain('**Sources**')
    expect(out).toContain('Red pandas live in the Himalayas [1].')
    expect(out).toContain('from the sources below')
    expect(displayContent({ content, provider: 'groq', sources: [] })).toBe(content)
  })
})
