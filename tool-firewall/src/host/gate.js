/** Cordis-facing pre-execute gate, kept separate from model and worker setup. */

import { extractToolPayload } from './extract.js'
import { evaluatePayload } from './firewall.js'

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Build the `tools/pre-execute` handler.
 * @param {object} deps - { tools, config, inference, cache, logger }
 */
export function createGateHandler(deps) {
  const { tools, config, inference, cache, logger } = deps
  return async function handlePreExecute(exec, next) {
    if (!config.enabled) return next()
    if (exec.signal !== undefined && exec.signal.aborted) return { kind: 'cancel' }
    try {
      const payload = extractToolPayload(exec, tools, config)
      const decision = await evaluatePayload(payload, config, { inference, cache, logger }, exec.signal)
      if (decision.blocked) {
        return { kind: 'deny', reason: decision.reason, info: decision.info }
      }
      if (exec.signal !== undefined && exec.signal.aborted) return { kind: 'cancel' }
      return await next()
    } catch (error) {
      const message = 'tool-firewall evaluation failed: ' + describeError(error)
      try {
        logger?.warn?.(message)
      } catch (failure) {}
      if (config.semanticFailure === 'closed') {
        return {
          kind: 'deny',
          reason: 'Tool firewall failed; the call was blocked by fail-closed policy.',
          info: { name: 'ToolFirewallError', code: 'TOOL_FIREWALL_UNAVAILABLE', reason: message },
        }
      }
      return await next()
    }
  }
}
