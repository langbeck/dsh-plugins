/** Evaluate one extracted tool payload and produce an allow/deny decision. */

import { createHash } from 'node:crypto'

import { analyzeStructural } from './structural.js'

function decisionBlocked(reason, detail, extra = {}) {
  return {
    blocked: true,
    reason,
    info: {
      name: 'ToolFirewallError',
      code: 'TOOL_FIREWALL_BLOCKED',
      ...detail === undefined ? {} : { reason: detail },
      ...extra,
    },
  }
}

function decisionAllowed(extra = {}) {
  return { blocked: false, ...extra }
}

function failureDecision(config, message) {
  if (config.semanticFailure === 'closed') {
    return {
      blocked: true,
      reason: 'Tool firewall is unavailable; the call was blocked by fail-closed policy.',
      info: { name: 'ToolFirewallError', code: 'TOOL_FIREWALL_UNAVAILABLE', reason: message },
    }
  }
  return { blocked: false, semanticUnavailable: true, error: message }
}

/** Dot product is cosine similarity because embeddings are normalized. */
export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) return undefined
  const length = Math.min(left.length, right.length)
  let dot = 0
  let leftSquared = 0
  let rightSquared = 0
  for (let index = 0; index < length; index += 1) {
    const a = Number(left[index])
    const b = Number(right[index])
    if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined
    dot += a * b
    leftSquared += a * a
    rightSquared += b * b
  }
  if (leftSquared === 0 || rightSquared === 0) return undefined
  return dot / Math.sqrt(leftSquared * rightSquared)
}

function cacheKey(payload, config) {
  const material = JSON.stringify([
    payload.name,
    payload.kind,
    payload.command,
    payload.description,
    config.embeddingEnabled,
    config.embeddingModel,
    config.embeddingRevision,
    config.classifierEnabled,
    config.classifierModel,
    config.classifierRevision,
    config.classifierLabels,
  ])
  return createHash('sha256').update(material).digest('hex')
}

function allowedByBypass(payload, config) {
  if (!payload.shell || typeof config.bypassRegex !== 'string' || config.bypassRegex === '') return false
  try {
    return new RegExp(config.bypassRegex).test(payload.command.trim())
  } catch (error) {
    return false
  }
}

/**
 * @param {object} payload - extractToolPayload() result.
 * @param {object} config - normalized and validated config.
 * @param {object} deps - { inference, cache, logger }
 * @param {AbortSignal} signal
 */
export async function evaluatePayload(payload, config, deps, signal) {
  const structural = analyzeStructural(payload.command, payload.kind)
  if (structural.hardBlock) {
    return decisionBlocked(
      `Tool firewall blocked tool "${payload.name}": ${structural.reasons[0] ?? 'dangerous command structure'}.`,
      `structural risk ${Math.round(structural.score * 100)}%`,
      { code: 'TOOL_FIREWALL_BLOCKED' },
    )
  }
  if (allowedByBypass(payload, config) && structural.score === 0) {
    return decisionAllowed({ bypass: true, structural })
  }

  const key = cacheKey(payload, config)
  const cached = deps.cache.get(key)
  if (cached !== undefined) return { ...cached, cached: true }

  const needsClassifier = config.classifierEnabled === true
  const needsAlignment = config.embeddingEnabled === true && payload.description !== null
  let modelResult
  if (needsClassifier || needsAlignment) {
    if (!deps.inference.ready) {
      return failureDecision(config, 'inference models are not ready')
    }
    try {
      modelResult = await deps.inference.evaluate(payload.command, needsAlignment ? payload.description : undefined, signal)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return failureDecision(config, message)
    }
  }

  const classifierScore = typeof modelResult?.maliceScore === 'number' ? modelResult.maliceScore : 0
  const maliceScore = Math.max(structural.score, classifierScore)
  const similarity = needsAlignment
    ? cosineSimilarity(modelResult?.commandEmbedding, modelResult?.descriptionEmbedding)
    : 1
  if (needsAlignment && similarity === undefined) {
    return failureDecision(config, 'embedding output was malformed')
  }
  const malicious = maliceScore > config.maliceThreshold
  const mismatch = needsAlignment && similarity < config.alignmentThreshold
  const blocked = malicious || (maliceScore > 0.5 && mismatch)
  const scores = {
    malice: Math.round(maliceScore * 1000) / 1000,
    alignment: Math.round((similarity ?? 1) * 1000) / 1000,
    structural: structural.score,
    classifier: Math.round(classifierScore * 1000) / 1000,
  }
  const decision = blocked
    ? decisionBlocked(
      `Tool firewall blocked tool "${payload.name}": ${malicious ? 'high malice score' : 'command/description mismatch'}.`,
      `malice=${scores.malice.toFixed(3)} alignment=${scores.alignment.toFixed(3)}`,
      { code: 'TOOL_FIREWALL_BLOCKED' },
    )
    : decisionAllowed({ structural, scores })
  deps.cache.set(key, decision)
  return decision
}
