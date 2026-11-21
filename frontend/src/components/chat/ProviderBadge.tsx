import { BookOpen, Cpu, Sparkles } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChatProvider } from '@/lib/api'
import { cn } from '@/lib/utils'

const PROVIDERS: Record<string, { label: string; hint: string; Icon: typeof BookOpen }> = {
  groq: {
    label: 'Language model · Groq',
    hint: 'Written by a hosted language model from the numbered sources below.',
    Icon: Sparkles,
  },
  ollama: {
    label: 'Local model · Ollama',
    hint: 'Written by a language model running on this machine from the numbered sources below.',
    Icon: Cpu,
  },
  fallback: {
    label: 'Retrieval-only answer',
    hint: 'No language model was available, so this answer is assembled directly from the retrieved sources.',
    Icon: BookOpen,
  },
}

export function ProviderBadge({
  provider,
  model,
  className,
}: {
  provider: ChatProvider
  model?: string | null
  className?: string
}) {
  const p = PROVIDERS[provider] ?? { label: provider, hint: 'Answer provider', Icon: Sparkles }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-caption text-fg-muted',
            className,
          )}
        >
          <p.Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          {p.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {p.hint}
        {model && <span className="mt-1 block font-mono opacity-80">{model}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
