/** Pure snapshot helpers for the Session Settings viewer. */

/** Merge a ToolHistory (base declarations + later additions) into one visible list. */
export function mergeToolHistory(history) {
  const byName = new Map()
  const base = history !== null && history !== undefined && Array.isArray(history.tools) ? history.tools : []
  for (const schema of base) {
    if (schema !== null && typeof schema === 'object' && typeof schema.name === 'string') byName.set(schema.name, schema)
  }
  const updates = history !== null && history !== undefined && Array.isArray(history.updates) ? history.updates : []
  for (const update of updates) {
    if (update === null || typeof update !== 'object' || !Array.isArray(update.additions)) continue
    for (const schema of update.additions) {
      if (schema !== null && typeof schema === 'object' && typeof schema.name === 'string') byName.set(schema.name, schema)
    }
  }
  return Array.from(byName.values())
}

/** Project one model-facing tool schema onto the viewer's JSON-safe shape. */
export function toolView(schema) {
  if (schema === null || typeof schema !== 'object' || typeof schema.name !== 'string') return undefined
  return {
    name: schema.name,
    description: typeof schema.description === 'string' ? schema.description : '',
    deferLoading: schema.deferLoading === true,
    parameters: schema.parameters !== null && typeof schema.parameters === 'object' ? schema.parameters : {},
  }
}

/** Project one Host command descriptor onto the viewer's JSON-safe shape. */
export function commandView(descriptor) {
  if (descriptor === null || typeof descriptor !== 'object' || typeof descriptor.name !== 'string') return undefined
  const input = descriptor.input !== null && descriptor.input !== undefined && typeof descriptor.input === 'object'
    ? descriptor.input
    : undefined
  return {
    name: descriptor.name,
    description: typeof descriptor.description === 'string' ? descriptor.description : '',
    inputHint: input !== undefined && typeof input.hint === 'string' ? input.hint : undefined,
    acceptsAttachments: input !== undefined && input.attachments === true,
  }
}

/**
 * Fold `tool/call` and `tool/result` events into recent per-tool calls.
 * Only the Session's own events are considered; fork-inherited history is not
 * this Session's work.
 */
export function foldRecentToolCalls(events, inheritedEventCount = 0, limit = 8) {
  const calls = new Map()
  const ordered = []
  for (const event of events) {
    if (event === null || typeof event !== 'object' || typeof event.type !== 'string') continue
    if (typeof event.seq === 'number' && event.seq < inheritedEventCount) continue
    const data = event.data !== null && typeof event.data === 'object' ? event.data : {}
    if (event.type === 'tool/call') {
      if (typeof data.callId !== 'string' || typeof data.name !== 'string') continue
      const call = {
        callId: data.callId,
        name: data.name,
        arguments: typeof data.arguments === 'string' ? data.arguments : '',
        turn: data.turn,
        step: data.step,
        at: event.time,
        status: 'pending',
      }
      calls.set(call.callId, call)
      ordered.push(call)
      continue
    }
    if (event.type !== 'tool/result') continue
    const call = calls.get(typeof data.callId === 'string' ? data.callId : '')
    if (call === undefined) continue
    call.status = data.error === undefined ? 'ok' : 'error'
    call.error = data.error === undefined ? undefined : { name: data.error.name, code: data.error.code, reason: data.error.reason }
    call.result = resultText(data.message)
  }
  return ordered.slice(-Math.max(0, limit)).reverse()
}

/** Count every own tool call in a Session, grouped by tool name. */
export function countToolCalls(events, inheritedEventCount = 0) {
  const counts = new Map()
  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'tool/call') continue
    if (typeof event.seq === 'number' && event.seq < inheritedEventCount) continue
    const data = event.data !== null && event.data !== undefined && typeof event.data === 'object' ? event.data : {}
    if (typeof data.name !== 'string') continue
    counts.set(data.name, (counts.get(data.name) ?? 0) + 1)
  }
  return counts
}

/** Flatten a tool result message's content for compact display. */
function resultText(message) {
  if (message === null || message === undefined || typeof message !== 'object') return ''
  const content = Array.isArray(message.content) ? message.content : []
  const parts = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (typeof block.text === 'string') parts.push(block.text)
    else if (typeof block.type === 'string') parts.push(`[${block.type}]`)
  }
  const text = parts.join('\n')
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text
}
