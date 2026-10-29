/** Minimal observable store for sidebar dialog state and stats. */

export function createValueStore(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot() {
      return value
    },
    set(next) {
      if (Object.is(value, next)) return
      value = next
      for (const listener of Array.from(listeners)) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
