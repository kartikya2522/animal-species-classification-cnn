import { forwardRef, type InputHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded border border-border-input bg-surface-raised px-3 text-small text-fg transition-colors placeholder:text-fg-muted hover:border-fg-muted focus-visible:border-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
