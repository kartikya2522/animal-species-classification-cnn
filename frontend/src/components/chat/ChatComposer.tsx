import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChatComposerProps {
  onSend: (text: string) => void
  onStop?: () => void
  /** True while an answer is streaming: the send button becomes Stop. */
  busy?: boolean
  disabled?: boolean
  placeholder?: string
  maxLength?: number
  suggestions?: string[]
  /** Pre-filled text (e.g. a question handed over from Identify); remount with a new `key` to change it. */
  initialValue?: string
  autoFocus?: boolean
  className?: string
}

export function ChatComposer({
  onSend,
  onStop,
  busy = false,
  disabled = false,
  placeholder = 'Ask about any animal — habitat, diet, behaviour, conservation…',
  maxLength = 2000,
  suggestions = [],
  initialValue = '',
  autoFocus = false,
  className,
}: ChatComposerProps) {
  const [value, setValue] = useState(initialValue)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  const canSend = value.trim().length > 0 && !busy && !disabled && value.length <= maxLength
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(value.trim())
    setValue('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  const remaining = maxLength - value.length

  return (
    <div className={className}>
      {suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || disabled}
              onClick={() => onSend(s)}
              className="rounded-full border border-border px-3 py-1 text-caption text-fg-secondary transition-colors hover:border-fg-muted hover:text-fg disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={submit}
        className={cn(
          'flex items-end gap-3 rounded-md border border-border-input bg-surface-raised p-2 pl-4 transition-colors focus-within:border-ring',
          disabled && 'opacity-60',
        )}
      >
        <label htmlFor="chat-composer" className="sr-only">
          Your question
        </label>
        <textarea
          id="chat-composer"
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-[200px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-body text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none"
        />
        {busy ? (
          <Button variant="secondary" size="icon" onClick={onStop} aria-label="Stop generating">
            <Square className="!size-3.5 fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!canSend} aria-label="Send question">
            <ArrowUp />
          </Button>
        )}
      </form>
      <div className="mt-2 flex justify-between text-caption text-fg-muted">
        <span>
          <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift + Enter</kbd> for
          a new line
        </span>
        {remaining < 200 && (
          <span className={cn('tabular', remaining < 0 && 'text-danger')}>{remaining} characters left</span>
        )}
      </div>
    </div>
  )
}
