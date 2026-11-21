import { Cpu, Server } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { InferenceBackend, InferenceMode } from '@/lib/inference/types'
import { cn } from '@/lib/utils'

const LABELS: Record<InferenceBackend, string> = {
  server: 'Server · ONNX Runtime',
  wasm: 'In your browser · WebAssembly',
  webgpu: 'In your browser · WebGPU',
}

const HINTS: Record<InferenceMode, string> = {
  server: 'The photo is sent to the WildLens backend, which runs the EfficientNetV2-S model on its CPU.',
  browser: 'The EfficientNetV2-S model runs inside this browser tab. The photo is never uploaded.',
}

/** Where inference runs: server (FastAPI + ONNX Runtime) or in the browser (onnxruntime-web). */
export function InferenceBadge({
  mode,
  backend,
  variant,
  className,
}: {
  mode: InferenceMode
  backend?: InferenceBackend
  variant?: string | null
  className?: string
}) {
  const b = backend ?? (mode === 'server' ? 'server' : 'wasm')
  const label = backend ? LABELS[b] : mode === 'server' ? LABELS.server : 'In your browser'
  const Icon = mode === 'server' ? Server : Cpu
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-testid="inference-mode"
          data-mode={mode}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-caption text-fg-muted',
            className,
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          {label}
          {variant && <span className="font-mono text-[0.6875rem] uppercase">{variant}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{HINTS[mode]}</TooltipContent>
    </Tooltip>
  )
}
