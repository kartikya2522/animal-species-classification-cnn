import { motion, useReducedMotion } from 'framer-motion'

import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ConfidenceBarProps {
  /** Probability in [0, 1]. */
  value: number
  label: string
  /** Emphasised (top-1) bar: ochre fill and taller track. */
  emphasis?: boolean
  /** Muted fill for uncertain results. */
  muted?: boolean
  /** Animation delay in seconds (for staggered lists). */
  delay?: number
  className?: string
}

export function ConfidenceBar({
  value,
  label,
  emphasis = false,
  muted = false,
  delay = 0,
  className,
}: ConfidenceBarProps) {
  const reduce = useReducedMotion()
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 10) / 10}
      aria-valuetext={formatPercent(value)}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-sunken',
        emphasis ? 'h-2' : 'h-1',
        className,
      )}
    >
      <motion.div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          muted ? 'bg-stone' : emphasis ? 'bg-accent' : 'bg-primary/70',
        )}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1], delay }}
      />
    </div>
  )
}
