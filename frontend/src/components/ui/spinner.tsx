import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  /** Accessible label; announced politely. */
  label?: string
  size?: 'sm' | 'md'
}

/** Understated activity indicator: a thin ring with a short ochre arc. */
export function Spinner({ className, label = 'Loading', size = 'md' }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center', className)}>
      <svg
        viewBox="0 0 24 24"
        className={cn('animate-spin [animation-duration:1.1s]', size === 'sm' ? 'size-4' : 'size-5')}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" fill="none" stroke="rgb(var(--border-strong))" strokeWidth="1.5" />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}
