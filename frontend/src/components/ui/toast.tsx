import * as ToastPrimitive from '@radix-ui/react-toast'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { dismissToast, useToasts, type ToastTone } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const toneIcon: Record<ToastTone, { Icon: typeof Info; className: string }> = {
  neutral: { Icon: Info, className: 'text-fg-muted' },
  success: { Icon: CheckCircle2, className: 'text-success' },
  warning: { Icon: AlertTriangle, className: 'text-warning' },
  danger: { Icon: XCircle, className: 'text-danger' },
}

/** Mount once near the root. Use `toast({...})` from use-toast to show messages. */
export function Toaster() {
  const toasts = useToasts()
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {toasts.map((t) => {
        const { Icon, className } = toneIcon[t.tone]
        return (
          <ToastPrimitive.Root
            key={t.id}
            open={t.open}
            onOpenChange={(open) => !open && dismissToast(t.id)}
            className={cn(
              'group relative flex w-[22rem] items-start gap-3 rounded border border-border bg-surface-raised p-4 pr-10 shadow-overlay',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
              'data-[swipe=end]:animate-out data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
            )}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', className)} strokeWidth={1.5} aria-hidden="true" />
            <div className="space-y-1">
              <ToastPrimitive.Title className="text-small font-semibold text-fg">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="text-caption text-fg-secondary">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="absolute right-3 top-3 rounded-sm p-0.5 text-fg-muted transition-colors hover:text-fg"
            >
              <X className="size-4" strokeWidth={1.5} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        )
      })}
      <ToastPrimitive.Viewport className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 outline-none" />
    </ToastPrimitive.Provider>
  )
}
