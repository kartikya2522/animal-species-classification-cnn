import { useEffect, useRef } from 'react'

export const prefersReducedMotion = () =>
  typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Gentle parallax for the hero photo: up to `max` px of drift over the first `range` px of scroll. */
export function useParallax<T extends HTMLElement>(max = 56, range = 700) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    let frame = 0
    const update = () => {
      frame = 0
      const y = Math.min(window.scrollY, range) / range
      el.style.transform = `translate3d(0, ${(y * max).toFixed(1)}px, 0) scale(1.08)`
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [max, range])
  return ref
}
