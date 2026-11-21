import { AlertCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded border border-border px-10 py-16 text-center',
        className,
      )}
    >
      {Icon && <Icon className="mb-5 size-7 text-stone" strokeWidth={1} aria-hidden="true" />}
      <p className="font-serif text-h4 text-fg">{title}</p>
      {description && <p className="mt-2 max-w-sm text-small text-fg-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: ReactNode
  /** e.g. HTTP status or error code, shown in mono. */
  detail?: string
  action?: ReactNode
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  detail,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex gap-4 rounded border border-danger/35 bg-danger-subtle/60 p-6', className)}
    >
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-fg">{title}</p>
        <div className="mt-1 text-small text-fg-secondary">{message}</div>
        {detail && <p className="type-mono mt-3">{detail}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  )
}
