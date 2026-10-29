/** DSH-style compact relative time, matching the workspace/session row labels. */

/** DSH-style compact age: `now`, `5min`, `2h`, `3d`, `4mo`, `1y`. */
export function relativeTimeParts(updatedAt, now) {
  const elapsed = typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : 0
  if (elapsed < 60_000) return { unit: 'now', n: 0 }
  if (elapsed < 3_600_000) return { unit: 'minutes', n: Math.floor(elapsed / 60_000) }
  if (elapsed < 86_400_000) return { unit: 'hours', n: Math.floor(elapsed / 3_600_000) }
  if (elapsed < 30 * 86_400_000) return { unit: 'days', n: Math.floor(elapsed / 86_400_000) }
  if (elapsed < 365 * 86_400_000) return { unit: 'months', n: Math.floor(elapsed / (30 * 86_400_000)) }
  return { unit: 'years', n: Math.floor(elapsed / (365 * 86_400_000)) }
}

/** Translate one compact age through the plugin dictionary. */
export function compactTimeLabel(parts, t) {
  return parts.unit === 'now' ? t('time.now') : t(`time.${parts.unit}`, { n: parts.n })
}

/** Absolute last-update datetime in the browser's locale, for the age tooltip. */
export function formatUpdatedAt(updatedAt) {
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return undefined
  const date = new Date(updatedAt)
  if (!Number.isFinite(date.getTime())) return undefined
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(date)
  } catch (error) {
    return date.toLocaleString()
  }
}
