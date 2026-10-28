/** Client-side session-cost fetch, polling and state. */

import { COST_ROUTE } from '../constants.js'
import { createSnapshotStore } from './store.js'

const IDLE = Object.freeze({ status: 'idle', sessionId: undefined, totalUsd: 0, partial: false })

/**
 * Track the cost of one Session at a time. The Host recomputes on demand, so
 * polling is cheap; the store keeps the previous value visible while a read is
 * in flight.
 */
export function createCostTracker() {
  const store = createSnapshotStore(IDLE)
  let abort
  let generation = 0
  let disposed = false

  function refresh(sessionId) {
    if (disposed) return Promise.resolve()
    if (typeof sessionId !== 'string' || sessionId === '') {
      generation += 1
      if (abort !== undefined) abort.abort()
      abort = undefined
      store.set(IDLE)
      return Promise.resolve()
    }
    if (abort !== undefined) abort.abort()
    const controller = new AbortController()
    abort = controller
    const current = ++generation
    const previous = store.getSnapshot()
    const keepsPrevious = previous.sessionId === sessionId && previous.status === 'ready'
    store.set({
      status: keepsPrevious ? 'refreshing' : 'loading',
      sessionId,
      totalUsd: keepsPrevious ? previous.totalUsd : 0,
      partial: keepsPrevious ? previous.partial : false,
    })
    return Promise.resolve()
      .then(() =>
        fetch(COST_ROUTE, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
        }),
      )
      .then((response) => {
        if (response === null || response === undefined || response.ok !== true) throw new Error('cost request failed')
        return response.json()
      })
      .then((result) => {
        if (disposed || current !== generation) return
        if (result === null || result === undefined || result.ok !== true) {
          store.set({ status: 'error', sessionId, totalUsd: 0, partial: false })
          return
        }
        const value = result.value
        if (value === null || value === undefined || value.pricing === null || value.pricing === undefined || value.pricing.ready !== true) {
          store.set({ status: 'unavailable', sessionId, totalUsd: 0, partial: false })
          return
        }
        const totalUsd = typeof value.totalUsd === 'number' && Number.isFinite(value.totalUsd) ? value.totalUsd : 0
        store.set({
          status: 'ready',
          sessionId,
          totalUsd,
          partial: typeof value.unpricedCalls === 'number' && value.unpricedCalls > 0,
        })
      })
      .catch(() => {
        if (disposed || current !== generation) return
        store.set({ status: 'error', sessionId, totalUsd: 0, partial: false })
      })
  }

  function dispose() {
    disposed = true
    generation += 1
    if (abort !== undefined) abort.abort()
  }

  return { store, refresh, dispose }
}
