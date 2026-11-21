import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'
import defaultTheme from 'tailwindcss/defaultTheme'

/** Colour tokens live in src/styles/globals.css as space-separated RGB channels. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const iucn = Object.fromEntries(
  ['lc', 'nt', 'vu', 'en', 'cr', 'ew', 'ex', 'dd', 'ne', 'na'].map((c) => [
    c,
    { DEFAULT: token(`iucn-${c}`), fg: token(`iucn-${c}-fg`) },
  ]),
)

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true },
    extend: {
      colors: {
        bg: token('bg'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
          sunken: token('surface-sunken'),
        },
        border: { DEFAULT: token('border'), strong: token('border-strong'), input: token('border-input') },
        fg: {
          DEFAULT: token('fg'),
          secondary: token('fg-secondary'),
          muted: token('fg-muted'),
        },
        primary: { DEFAULT: token('primary'), hover: token('primary-hover'), fg: token('primary-fg') },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          fg: token('accent-fg'),
          text: token('accent-text'),
          subtle: token('accent-subtle'),
        },
        ring: token('ring'),
        success: { DEFAULT: token('success'), subtle: token('success-subtle') },
        warning: { DEFAULT: token('warning'), subtle: token('warning-subtle') },
        danger: { DEFAULT: token('danger'), subtle: token('danger-subtle') },
        iucn,
        chart: {
          1: token('chart-1'),
          2: token('chart-2'),
          3: token('chart-3'),
          4: token('chart-4'),
          grid: token('chart-grid'),
        },
        model: {
          1: token('model-1'),
          2: token('model-2'),
          3: token('model-3'),
          4: token('model-4'),
        },
        stone: token('stone'),
      },
      fontFamily: {
        serif: ['"Fraunces Variable"', 'Georgia', ...defaultTheme.fontFamily.serif],
        sans: ['"Inter Variable"', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono Variable"', ...defaultTheme.fontFamily.mono],
      },
      fontSize: {
        display: ['4.5rem', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
        h1: ['3.25rem', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        h2: ['2.375rem', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        h3: ['1.75rem', { lineHeight: '1.22', letterSpacing: '-0.01em' }],
        h4: ['1.3125rem', { lineHeight: '1.3', letterSpacing: '-0.005em' }],
        lead: ['1.25rem', { lineHeight: '1.6' }],
        body: ['1rem', { lineHeight: '1.65' }],
        small: ['0.875rem', { lineHeight: '1.55' }],
        caption: ['0.8125rem', { lineHeight: '1.45' }],
        overline: ['0.75rem', { lineHeight: '1.3', letterSpacing: '0.14em' }],
        stat: ['3rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      maxWidth: {
        prose: '42rem',
        content: '80rem',
        wide: '90rem',
      },
      spacing: {
        gutter: '3rem',
        section: '7rem',
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        raised: '0 1px 2px rgb(var(--shadow) / 0.06), 0 8px 24px -12px rgb(var(--shadow) / 0.18)',
        overlay: '0 2px 6px rgb(var(--shadow) / 0.08), 0 24px 48px -16px rgb(var(--shadow) / 0.32)',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      keyframes: {
        'caret-blink': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        'caret-blink': 'caret-blink 1.1s steps(1) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config
