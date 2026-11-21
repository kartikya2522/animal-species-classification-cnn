import { Monitor } from 'lucide-react'

import { Wordmark } from '@/components/layout/Wordmark'

/** Shown instead of the app below 1024 px: WildLens targets laptop and desktop screens. */
export function ScreenSizeNotice() {
  return (
    <div className="fixed inset-0 z-[200] hidden flex-col items-center justify-center bg-bg px-8 text-center max-[1023px]:flex">
      <Wordmark />
      <Monitor className="mb-6 mt-12 size-8 text-stone" strokeWidth={1} aria-hidden="true" />
      <p className="font-serif text-h3 text-fg">Designed for larger screens</p>
      <p className="mt-3 max-w-sm text-small text-fg-muted">
        WildLens is designed for laptop and desktop screens. Please open it on a device at least 1024 pixels
        wide, or widen your browser window.
      </p>
    </div>
  )
}
