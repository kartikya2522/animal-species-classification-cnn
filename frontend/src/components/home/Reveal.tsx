import { useEffect, useRef, useState, type ReactNode } from 'react'

import { prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * Home-page only: a slow fade with a short rise as a block scrolls into view (once).
 * IntersectionObserver + CSS transitions (no animation library in the home chunk). Under reduced
 * motion, or without IntersectionObserver, the content renders in place with no animation.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    const el = ref.current
    if (shown || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] ease-editorial [transition-duration:900ms]',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className,
      )}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  )
}
