/** Number formatting helpers (pair with the `tabular` utility in the UI). */

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatMs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value < 10 ? `${value.toFixed(1)} ms` : `${Math.round(value)} ms`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
