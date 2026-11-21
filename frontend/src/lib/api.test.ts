import { describe, expect, it } from 'vitest'

import { createSseParser, parseChatEvent, type ChatEvent, type RawSseEvent } from '@/lib/api'

const STREAM =
  'event: meta\n' +
  'data: {"provider": "fallback", "model": null, "retrieval": "kb", "subjects": [{"name": "Red panda", "scientific_name": "Ailurus fulgens", "slug": "red-panda"}], "sources": [{"id": 1, "title": "Wikipedia: Red panda", "url": "https://en.wikipedia.org/wiki/Red_panda", "kind": "wikipedia"}], "skipped": [{"provider": "llm", "reason": "no LLM configured (set GROQ_API_KEY)"}]}\n\n' +
  'event: token\ndata: {"text": "Red pandas live in "}\n\n' +
  'event: token\ndata: {"text": "the eastern Himalayas [1].\\n"}\n\n' +
  ': keep-alive comment\n\n' +
  'event: done\ndata: {"provider": "fallback", "finish_reason": "stop", "elapsed_ms": 3.2}\n\n'

function collect(chunks: string[]): RawSseEvent[] {
  const out: RawSseEvent[] = []
  const parser = createSseParser((e) => out.push(e))
  chunks.forEach((c) => parser.feed(c))
  parser.flush()
  return out
}

describe('createSseParser', () => {
  it('parses a complete stream', () => {
    const events = collect([STREAM])
    expect(events.map((e) => e.event)).toEqual(['meta', 'token', 'token', 'done'])
  })

  it('gives identical results however the stream is chunked', () => {
    const whole = collect([STREAM])
    const bytewise = collect(STREAM.split(''))
    const ragged = collect([
      STREAM.slice(0, 7),
      STREAM.slice(7, 300),
      STREAM.slice(300, 301),
      STREAM.slice(301),
    ])
    expect(bytewise).toEqual(whole)
    expect(ragged).toEqual(whole)
  })

  it('handles CRLF line endings, multi-line data and a missing final blank line', () => {
    const events = collect([
      'event: token\r\ndata: {"text":\r\n',
      'data: "a"}\r',
      '\n\r\nevent: done\ndata: {}',
    ])
    expect(events).toEqual([
      { event: 'token', data: '{"text":\n"a"}' },
      { event: 'done', data: '{}' },
    ])
  })

  it('defaults the event name to "message"', () => {
    expect(collect(['data: x\n\n'])).toEqual([{ event: 'message', data: 'x' }])
  })
})

describe('parseChatEvent', () => {
  it('maps backend events to typed chat events', () => {
    const typed = collect([STREAM]).map(parseChatEvent)
    expect(typed[0]).toMatchObject({
      type: 'meta',
      provider: 'fallback',
      model: null,
      retrieval: 'kb',
      sources: [{ id: 1, kind: 'wikipedia' }],
      subjects: [{ slug: 'red-panda' }],
    })
    const text = typed
      .filter((e): e is Extract<ChatEvent, { type: 'token' }> => e?.type === 'token')
      .map((e) => e.text)
      .join('')
    expect(text).toBe('Red pandas live in the eastern Himalayas [1].\n')
    expect(typed[3]).toEqual({ type: 'done', provider: 'fallback', finish_reason: 'stop', elapsed_ms: 3.2 })
  })

  it('parses error events and ignores malformed or unknown ones', () => {
    expect(parseChatEvent({ event: 'error', data: '{"message": "time budget exceeded"}' })).toEqual({
      type: 'error',
      message: 'time budget exceeded',
    })
    expect(parseChatEvent({ event: 'token', data: 'not json' })).toBeNull()
    expect(parseChatEvent({ event: 'token', data: '{"nope": 1}' })).toBeNull()
    expect(parseChatEvent({ event: 'ping', data: '{}' })).toBeNull()
  })
})
