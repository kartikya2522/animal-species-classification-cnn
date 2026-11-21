import type { HTMLAttributes, ReactNode } from 'react'

import { Container, type ContainerWidth } from '@/components/layout/Container'
import { cn } from '@/lib/utils'

interface SectionProps extends HTMLAttributes<HTMLElement> {
  width?: ContainerWidth
  /** Vertical rhythm. `default` = 7rem, `compact` = 4rem, `flush` = none. */
  spacing?: 'default' | 'compact' | 'flush'
  tone?: 'default' | 'surface' | 'sunken'
  /** Hairline rule above the section. */
  divided?: boolean
}

export function Section({
  width = 'content',
  spacing = 'default',
  tone = 'default',
  divided = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        spacing === 'default' && 'py-section',
        spacing === 'compact' && 'py-16',
        tone === 'surface' && 'bg-surface',
        tone === 'sunken' && 'bg-surface-sunken',
        className,
      )}
      {...props}
    >
      <Container width={width} className={cn(divided && 'border-t border-border pt-16')}>
        {children}
      </Container>
    </section>
  )
}

interface SectionHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  lead?: ReactNode
  /** Heading level for the title (visual size stays consistent). */
  as?: 'h1' | 'h2' | 'h3'
  size?: 'display' | 'lg' | 'md'
  align?: 'start' | 'center'
  actions?: ReactNode
  className?: string
  id?: string
}

export function SectionHeader({
  eyebrow,
  title,
  lead,
  as: Heading = 'h2',
  size = 'lg',
  align = 'start',
  actions,
  className,
  id,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        'mb-12 flex gap-10',
        align === 'center' ? 'flex-col items-center text-center' : 'items-end justify-between',
        className,
      )}
    >
      <div className={cn('max-w-3xl', align === 'center' && 'mx-auto')}>
        {eyebrow && (
          <p className="type-overline mb-4 flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-8 bg-accent" />
            {eyebrow}
          </p>
        )}
        <Heading
          id={id}
          className={cn(
            size === 'display' && 'type-display',
            size === 'lg' && 'type-h1',
            size === 'md' && 'type-h2',
          )}
        >
          {title}
        </Heading>
        {lead && <p className={cn('type-lead mt-5 max-w-prose', align === 'center' && 'mx-auto')}>{lead}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
    </header>
  )
}
