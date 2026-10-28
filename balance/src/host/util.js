/** Small Host-side helpers. */

export function describeError(error) {
  if (error === null || error === undefined) return 'unknown error'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message !== '') return error.message
  return String(error)
}

export function toNumber(value) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
