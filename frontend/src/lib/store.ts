import { useSyncExternalStore } from 'react'

/**
 * Minimal in-memory store for state that should survive route changes within a session
 * (last identification, Field Guide conversation) but not reloads.
 */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  const get = () => state
  const set = (next: T | ((prev: T) => T)) => {
    state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
    listeners.forEach((l) => l())
  }
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  const use = () => useSyncExternalStore(subscribe, get, get)
  return { get, set, subscribe, use, reset: () => set(initial) }
}
