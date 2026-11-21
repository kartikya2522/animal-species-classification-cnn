import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-200 ease-editorial focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]',
  {
    variants: {
      variant: {
        primary: 'rounded bg-primary text-primary-fg hover:bg-primary-hover',
        secondary:
          'rounded border border-border-strong bg-transparent text-fg hover:border-fg hover:bg-surface-raised',
        accent: 'rounded bg-accent text-accent-fg hover:bg-accent-hover',
        ghost: 'rounded text-fg-secondary hover:bg-surface-sunken hover:text-fg',
        link: 'h-auto px-0 text-fg underline decoration-border-strong underline-offset-4 hover:decoration-accent',
        danger: 'rounded bg-danger text-bg hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 px-3 text-small',
        md: 'h-10 px-4 text-small',
        lg: 'h-12 px-6 text-body',
        icon: 'size-9 rounded',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'px-0' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a router Link) with button styles. */
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(asChild ? {} : { type: type ?? 'button' })}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
