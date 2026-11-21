import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between gap-2 rounded border border-border-input bg-surface-raised px-3 text-small text-fg transition-colors hover:border-fg-muted focus-visible:border-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-fg-muted [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = 'SelectTrigger'

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded border border-border bg-surface-raised text-fg shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0',
        position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)] translate-y-1',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = 'SelectContent'

export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn('type-overline px-2 py-1.5', className)} {...props} />
))
SelectLabel.displayName = 'SelectLabel'

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    /** Secondary text (e.g. a count) shown in the list but not in the trigger. */
    hint?: ReactNode
  }
>(({ className, children, hint, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-2 pl-8 pr-3 text-small outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-sunken data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4 text-accent-text" strokeWidth={1.75} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    {hint != null && <span className="tabular ml-auto pl-6 text-caption text-fg-muted">{hint}</span>}
  </SelectPrimitive.Item>
))
SelectItem.displayName = 'SelectItem'
