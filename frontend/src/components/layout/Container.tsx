import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export type ContainerWidth = 'prose' | 'content' | 'wide' | 'full'

const widths: Record<ContainerWidth, string> = {
  prose: 'max-w-prose',
  content: 'max-w-content',
  wide: 'max-w-wide',
  full: 'max-w-none',
}

/** Page container: 48 px gutters; content 1280 px, wide 1440 px, prose 672 px. */
export function Container({
  width = 'content',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { width?: ContainerWidth }) {
  return (
    <div
      className={cn('mx-auto w-full px-gutter', widths[width], width === 'prose' && 'box-content', className)}
      {...props}
    />
  )
}
