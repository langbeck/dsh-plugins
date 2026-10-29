/** Typed-ish client wrapper over the Host's authenticated route. */

import { ROUTE } from '../constants.js'

async function post(body) {
  const response = await fetch(ROUTE, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => undefined)
  if (response.ok !== true || payload === undefined || payload.ok !== true) {
    const message = payload !== undefined && payload.error !== undefined && typeof payload.error.message === 'string'
      ? payload.error.message
      : 'session-settings request failed'
    throw new Error(message)
  }
  return payload.value
}

export function readSettings(sessionId) {
  return post({ sessionId, action: 'read' })
}

export function applyPreset(sessionId, preset) {
  return post({ sessionId, action: 'preset', preset })
}

export function saveAllowList(sessionId, tools) {
  return post({ sessionId, action: 'allowlist', tools })
}
