/** React hooks used by the Balanced Row and settings form. */

import React from 'react'

export function useSnapshot(store) {
  const [snapshot, setSnapshot] = React.useState(() => store.getSnapshot())
  React.useEffect(() => {
    setSnapshot(store.getSnapshot())
    return store.subscribe(() => setSnapshot(store.getSnapshot()))
  }, [store])
  return snapshot
}

/** Re-render for relative-time text without polling the balance faster. */
export function useNow(intervalMs) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
