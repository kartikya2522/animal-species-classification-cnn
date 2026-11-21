import { Link, NavLink } from 'react-router-dom'

import { Container } from '@/components/layout/Container'
import { NAV_ITEMS } from '@/components/layout/nav'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Wordmark } from '@/components/layout/Wordmark'
import { cn } from '@/lib/utils'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-[2px]">
      <Container width="content" className="flex h-16 items-center justify-between">
        <Link to="/" aria-label="WildLens home" className="rounded-sm">
          <span className="sr-only">WildLens</span>
          <span aria-hidden="true">
            <Wordmark />
          </span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'relative block rounded-sm px-3.5 py-2 text-small font-medium transition-colors',
                      isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-x-3.5 -bottom-[13px] h-[2px] bg-accent transition-opacity',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <span aria-hidden="true" className="mx-3 h-5 w-px bg-border" />
          <ThemeToggle />
        </nav>
      </Container>
    </header>
  )
}
