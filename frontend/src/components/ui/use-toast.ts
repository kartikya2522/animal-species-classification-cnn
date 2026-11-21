import { useSyncExternalStore } from 'react'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
  open: boolean
}

type Listener = () => void

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())

/** Show a toast. Returns its id. At most three are kept on screen. */
export function toast(input: { title: string; description?: string; tone?: ToastTone }): number {
  const id = nextId++
  items = [
    ...items,
    { id, title: input.title, description: input.description, tone: input.tone ?? 'neutral', open: true },
  ].slice(-3)
  emit()
  return id
}

export function dismissToast(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, open: false } : t))
  emit()
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id)
    emit()
  }, 300)
}

function subscribe(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  )
}
