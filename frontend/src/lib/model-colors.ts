import { MODEL_ORDER } from '@/content/study'

/** Categorical colour per model: fixed by MODEL_ORDER, never by rank; unknown models get stone. */
export function modelColor(id: string): string {
  const i = (MODEL_ORDER as readonly string[]).indexOf(id)
  return i >= 0 ? `rgb(var(--model-${i + 1}))` : 'rgb(var(--chart-3))'
}
