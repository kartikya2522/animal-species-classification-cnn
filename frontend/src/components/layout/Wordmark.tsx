import { cn } from '@/lib/utils'

/** Typographic wordmark — no logo artwork. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline font-serif text-[1.5rem] leading-none tracking-[-0.02em] text-fg',
        className,
      )}
    >
      <span className="font-[560]">Wild</span>
      <span className="font-[320] italic">Lens</span>
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block size-[5px] translate-y-[-1px] rounded-full bg-accent"
      />
    </span>
  )
}
