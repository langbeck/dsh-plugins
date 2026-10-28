/**
 * Session-cost fold.
 *
 * Reads one Session's live-preferred event log, mirrors token-meter's
 * settlement/retry semantics, prices each owned model call at its step-start
 * instant, and adds subagent descendants. Fork-inherited events are ignored so
 * a forked Session is not charged for its parent's history.
 */

import { resolvePrice, resolvePricingModel } from './pricing.js'
import { describeError, numberOrZero } from './util.js'

const SESSION_CACHE_LIMIT = 128

export async function readSessionCost(ctx, pricing, catalogCache, cache, payload, signal) {
  const sessionId = payload !== null && payload !== undefined && typeof payload.sessionId === 'string' ? payload.sessionId : ''
  if (sessionId === '') throw new Error('sessionId is required')
  await pricing.ensure()
  const query = ctx.get('sessionQuery')
  if (query === undefined) throw new Error('sessionQuery is unavailable in this deployment')

  const rootObservation = await observeSession(query, sessionId, signal)
  let root
  try {
    root = await priceObservation(ctx, pricing, catalogCache, cache, rootObservation, signal)
  } finally {
    releaseObservation(rootObservation)
  }

  const descendants = await listSubagentSessionIds(query, sessionId, signal)
  const agents = [root.summary]
  const byModel = new Map(root.byModel.map((entry) => [`${entry.provider}\u0000${entry.model}`, { ...entry }]))
  let totalUsd = root.summary.totalUsd
  let pricedCalls = root.summary.pricedCalls
  let unpricedCalls = root.summary.unpricedCalls
  let unpricedTokens = root.summary.unpricedTokens

  for (const childId of descendants) {
    let observation
    try {
      observation = await observeSession(query, childId, signal)
      const child = await priceObservation(ctx, pricing, catalogCache, cache, observation, signal)
      agents.push(child.summary)
      totalUsd += child.summary.totalUsd
      pricedCalls += child.summary.pricedCalls
      unpricedCalls += child.summary.unpricedCalls
      unpricedTokens += child.summary.unpricedTokens
      for (const entry of child.byModel) {
        const key = `${entry.provider}\u0000${entry.model}`
        const aggregate = byModel.get(key) ?? { ...entry, costUsd: 0, calls: 0 }
        aggregate.costUsd += entry.costUsd
        aggregate.calls += entry.calls
        byModel.set(key, aggregate)
      }
    } catch (failure) {
      agents.push({
        sessionId: childId,
        totalUsd: 0,
        pricedCalls: 0,
        unpricedCalls: 0,
        unpricedTokens: 0,
        error: describeError(failure),
      })
    } finally {
      if (observation !== undefined) releaseObservation(observation)
    }
  }

  const state = pricing.state()
  return {
    sessionId,
    asOfSeq: root.asOfSeq,
    totalUsd,
    ownUsd: root.summary.totalUsd,
    subagentsUsd: totalUsd - root.summary.totalUsd,
    pricedCalls,
    unpricedCalls,
    unpricedTokens,
    agents,
    byModel: Array.from(byModel.values()),
    pricing: {
      ready: state.ready,
      fetchedAt: state.fetchedAt,
      revision: state.revision,
      error: state.error,
    },
  }
}

/** Price one immutable Session observation, caching by cut + pricing revision. */
async function priceObservation(ctx, pricing, catalogCache, cache, observation, signal) {
  const state = pricing.state()
  const asOfSeq = observation.cursor
  const inherited = Number.isSafeInteger(observation.inheritedEventCount) ? observation.inheritedEventCount : 0
  const cacheKey = `${observation.header.id}|${asOfSeq}|${inherited}|${state.revision}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const settlements = foldUsage(observation.events)
  const resolved = new Map()
  const unresolved = new Set()
  for (const settlement of settlements.values()) {
    if (settlement.seq < inherited) continue
    const key = `${settlement.provider}\u0000${settlement.model}`
    if (resolved.has(key) || unresolved.has(key)) continue
    const entry = await resolvePricingModel(ctx, pricing, catalogCache, settlement.provider, settlement.model)
    if (entry === undefined) unresolved.add(key)
    else resolved.set(key, entry)
  }

  const priced = priceSettlements(settlements, inherited, (provider, model) => resolved.get(`${provider}\u0000${model}`))
  const result = {
    asOfSeq,
    summary: {
      sessionId: observation.header.id,
      origin: observation.header.origin,
      totalUsd: priced.totalUsd,
      pricedCalls: priced.pricedCalls,
      unpricedCalls: priced.unpricedCalls,
      unpricedTokens: priced.unpricedTokens,
    },
    byModel: priced.byModel,
  }
  if (cache.size >= SESSION_CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(cacheKey, result)
  return result
}

/** Price every owned settlement with a synchronous model-to-price lookup. */
export function priceSettlements(settlements, inherited, entryFor) {
  const byModel = new Map()
  let totalUsd = 0
  let pricedCalls = 0
  let unpricedCalls = 0
  let unpricedTokens = 0
  for (const settlement of settlements.values()) {
    if (settlement.seq < inherited) continue
    const usage = usageBuckets(settlement.usage)
    const entry = entryFor(settlement.provider, settlement.model)
    if (entry === undefined) {
      unpricedCalls += 1
      unpricedTokens += usage.cacheRead + usage.input + usage.cacheWrite + usage.output
      continue
    }
    const price = resolvePrice(entry.pricing, settlement.at)
    const total = usage.cacheRead * price.cacheRead
      + usage.input * price.prompt
      + usage.cacheWrite * price.cacheWrite
      + usage.output * price.completion
    const key = `${settlement.provider}\u0000${settlement.model}`
    const aggregate = byModel.get(key) ?? {
      provider: settlement.provider,
      model: settlement.model,
      pricingModel: entry.id,
      pricingName: entry.name,
      costUsd: 0,
      calls: 0,
    }
    aggregate.costUsd += total
    aggregate.calls += 1
    byModel.set(key, aggregate)
    totalUsd += total
    pricedCalls += 1
  }
  return { totalUsd, pricedCalls, unpricedCalls, unpricedTokens, byModel: Array.from(byModel.values()) }
}

/** Token buckets in the shape the price calculation uses. */
export function usageBuckets(usage) {
  return {
    cacheRead: numberOrZero(usage.cacheReadTokens),
    input: numberOrZero(usage.inputTokens),
    cacheWrite: numberOrZero(usage.cacheWriteTokens),
    output: numberOrZero(usage.outputTokens),
  }
}

/** Mirror token-meter's settlement fold: one usage sample per turn/step, retries replace. */
export function foldUsage(events) {
  const header = { provider: '', model: '' }
  const steps = new Map()
  const settlements = new Map()
  const keyOf = (turn, step) => `${turn}:${step}`
  for (const event of events) {
    if (event === null || typeof event !== 'object' || typeof event.type !== 'string') continue
    const data = event.data !== null && typeof event.data === 'object' ? event.data : {}
    if (event.type === 'request/header') {
      const config = data.header !== null && data.header !== undefined && typeof data.header === 'object' ? data.header.config : undefined
      if (config !== null && config !== undefined && typeof config === 'object' && typeof config.provider === 'string' && typeof config.model === 'string' && config.model !== '') {
        header.provider = config.provider
        header.model = config.model
      }
      continue
    }
    if (event.type === 'step/start') {
      steps.set(keyOf(data.turn, data.step), { at: event.time, provider: header.provider, model: header.model })
      continue
    }
    if (event.type === 'llm/retry-started') {
      settlements.delete(keyOf(data.turn, data.step))
      continue
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue
    const usage = usageOfSettlement(data)
    if (usage === undefined) continue
    const key = keyOf(data.turn, data.step)
    const step = steps.get(key)
    settlements.set(key, {
      seq: event.seq,
      at: step === undefined ? event.time : step.at,
      provider: step === undefined ? header.provider : step.provider,
      model: step === undefined ? header.model : step.model,
      usage,
    })
  }
  return settlements
}

/** Usage from the settlement's own field or the trailing usage chunk of its stream. */
function usageOfSettlement(data) {
  if (data.usage !== null && data.usage !== undefined && typeof data.usage === 'object') return data.usage
  const stream = data.stream
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record === null || typeof record !== 'object' || record.type !== 'chunk') continue
    const chunk = record.chunk
    if (chunk === null || chunk === undefined || typeof chunk !== 'object') continue
    if (chunk.type === 'usage' && chunk.usage !== null && typeof chunk.usage === 'object') return chunk.usage
  }
  return undefined
}

/** Observe one Session through the live-preferred query service. */
async function observeSession(query, sessionId, signal) {
  return query.observeSession(sessionId, { signal, projectionMode: 'none' })
}

function releaseObservation(observation) {
  try {
    if (typeof observation[Symbol.dispose] === 'function') observation[Symbol.dispose]()
    else if (typeof observation.dispose === 'function') observation.dispose()
  } catch (error) {}
}

/** Recursively list subagent children of one Session, excluding user forks. */
async function listSubagentSessionIds(query, sessionId, signal) {
  const ids = []
  try {
    const trace = await query.traceSession(sessionId, signal)
    const visit = (nodes) => {
      if (!Array.isArray(nodes)) return
      for (const node of nodes) {
        const session = node !== null && node !== undefined ? node.session : undefined
        const header = session !== null && session !== undefined ? session.header : undefined
        if (header === null || header === undefined || header.origin !== 'subagent') continue
        ids.push(header.id)
        visit(node.descendants)
      }
    }
    visit(trace.descendants)
    return ids
  } catch (error) {}
  try {
    const records = await query.listSessions()
    const children = new Map()
    for (const record of records) {
      const header = record.header
      if (header.parentSession === undefined) continue
      const list = children.get(header.parentSession) ?? []
      list.push(header)
      children.set(header.parentSession, list)
    }
    const queue = [sessionId]
    while (queue.length > 0) {
      const current = queue.shift()
      for (const header of children.get(current) ?? []) {
        if (header.origin !== 'subagent') continue
        ids.push(header.id)
        queue.push(header.id)
      }
    }
  } catch (error) {}
  return ids
}
