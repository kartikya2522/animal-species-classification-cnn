import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { ScreenSizeNotice } from '@/components/layout/ScreenSizeNotice'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'

export function AppShell() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <ScreenSizeNotice />
      <div className="flex min-h-screen flex-col max-[1023px]:hidden">
        <a
          href="#main"
          className="sr-only z-50 rounded bg-primary px-4 py-2 text-small text-primary-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </>
  )
}
