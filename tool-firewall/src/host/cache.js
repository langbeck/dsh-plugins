/** Small bounded decision cache for the tool firewall. */

export function createDecisionCache(maxEntries, ttlMs) {
  const entries = new Map()
  const limit = Number.isFinite(maxEntries) ? Math.max(1, Math.round(maxEntries)) : 256
  const ttl = Number.isFinite(ttlMs) ? Math.max(1000, Math.round(ttlMs)) : 600_000

  function get(key) {
    const entry = entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key)
      return undefined
    }
    entries.delete(key)
    entries.set(key, entry)
    return entry.value
  }

  function set(key, value) {
    const now = Date.now()
    entries.delete(key)
    entries.set(key, { value, expiresAt: now + ttl })
    while (entries.size > limit) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  function clear() {
    entries.clear()
  }

  return { get, set, clear, size: () => entries.size }
}
