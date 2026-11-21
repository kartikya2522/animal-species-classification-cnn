import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

/** Quiet placeholder block; a slow sheen, disabled under reduced motion. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-sm bg-surface-sunken bg-[linear-gradient(90deg,transparent_0,rgb(var(--surface-raised)/0.5)_50%,transparent_100%)] bg-[length:400px_100%] bg-no-repeat animate-shimmer motion-reduce:animate-none motion-reduce:bg-none',
        className,
      )}
      {...props}
    />
  )
}
