/** React hook used by the configuration form. */

import React from 'react'

export function useSnapshot(store) {
  const [snapshot, setSnapshot] = React.useState(() => store.getSnapshot())
  React.useEffect(() => {
    setSnapshot(store.getSnapshot())
    return store.subscribe(() => setSnapshot(store.getSnapshot()))
  }, [store])
  return snapshot
}
