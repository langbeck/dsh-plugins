/**
 * Balance — Host half (Cordis plugin).
 *
 * Besides the row and its Config schema, the Host owns the Session-cost
 * estimate:
 *
 * - OpenRouter's public model list supplies DeepSeek prices, including the
 *   weekday peak-time `overrides`. Rows are fetched at startup and every
 *   `pricingRefreshSeconds` (default 1 hour).
 * - DSH model ids are mapped to OpenRouter through the `~deepseek/*-latest`
 *   aliases, then priced from the alias target's concrete row.
 * - `sessionQuery` supplies each Session's live-preferred event log; the fold
 *   mirrors token-meter's usage/retry semantics and prices every settlement at
 *   its step-start instant, summing the Session and its subagent descendants.
 * - The Client POSTs to the authenticated exact Fetch route
 *   `/api/balance-session-cost` on the Connection carrier (owner peer only).
 */

import Schema from '@deepseek-ai/schemastery'

export const name = 'balance'

export const inject = ['connection']

export const Config = Schema.object({
  refreshSeconds: Schema.number().min(0).max(3600).step(1).default(60),
  showZeroBalances: Schema.boolean().default(true),
  showCurrencyName: Schema.boolean().default(true),
  pricingRefreshSeconds: Schema.number().min(60).max(86400).step(1).default(3600),
})

const COST_ROUTE = '/api/balance-session-cost'
const PRICING_URL = 'https://openrouter.ai/api/v1/models?model_authors=deepseek'
const PRICING_TIMEOUT_MS = 15000
const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000
const SESSION_CACHE_LIMIT = 128
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Model ids whose served release already has a dedicated OpenRouter row. The
 * alias is preferred over guessing: its target is the version OpenRouter calls
 * "latest", which is what the provider is currently serving.
 */
const MODEL_ALIASES = {
  'deepseek-flash': '~deepseek/deepseek-flash-latest',
  'deepseek-v4-pro': '~deepseek/deepseek-pro-latest',
}

export function apply(ctx, config) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  const pricingRefreshSeconds = Number.isFinite(settings.pricingRefreshSeconds) && settings.pricingRefreshSeconds >= 60
    ? Math.round(settings.pricingRefreshSeconds)
    : 3600
  const pricing = createPricing(pricingRefreshSeconds)
  const costCache = new Map()
  const catalogCache = new Map()

  ctx.effect(() => {
    pricing.start()
    return () => pricing.dispose()
  }, 'balance: pricing')

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: COST_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await request.json()
          const value = await readSessionCost(ctx, pricing, catalogCache, costCache, payload, request.signal)
          return Response.json({ ok: true, value: value })
        } catch (error) {
          return Response.json({ ok: false, error: { code: 'session-cost-failed', message: describeError(error), details: {} } })
        }
      },
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'balance: session-cost route')
}

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------

/** Fetch and cache DeepSeek pricing from OpenRouter. */
function createPricing(refreshSeconds) {
  let models = new Map()
  let aliases = new Map()
  let fetchedAt = 0
  let revision = 0
  let error
  let inflight
  let timer
  let stopped = false

  async function refresh() {
    if (stopped) return
    if (inflight !== undefined) return inflight
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PRICING_TIMEOUT_MS)
    inflight = (async () => {
      try {
        const response = await fetch(PRICING_URL, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('OpenRouter models request returned HTTP ' + String(response.status))
        const parsed = parsePricing(await response.json())
        if (parsed.models.size === 0) throw new Error('OpenRouter returned no deepseek/ pricing entries')
        models = parsed.models
        aliases = parsed.aliases
        fetchedAt = Date.now()
        revision += 1
        error = undefined
      } catch (failure) {
        error = describeError(failure)
      } finally {
        clearTimeout(timeout)
        inflight = undefined
      }
    })()
    return inflight
  }

  function start() {
    void refresh()
    timer = setInterval(() => {
      void refresh()
    }, Math.max(60, refreshSeconds) * 1000)
  }

  function dispose() {
    stopped = true
    if (timer !== undefined) clearInterval(timer)
  }

  function state() {
    return { models, aliases, fetchedAt, revision, error, ready: models.size > 0 }
  }

  function ensure() {
    if (models.size > 0) return Promise.resolve()
    return refresh()
  }

  return { start, dispose, refresh, ensure, state }
}

/** Split one OpenRouter models response into concrete DeepSeek rows and their aliases. */
function parsePricing(body) {
  const rows = body !== null && body !== undefined && Array.isArray(body.data) ? body.data : []
  const models = new Map()
  const aliases = new Map()
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    if (typeof row.id !== 'string' || !row.id.startsWith('deepseek/')) continue
    const pricing = row.pricing
    if (pricing === null || typeof pricing !== 'object') continue
    if (typeof pricing.prompt !== 'string' || typeof pricing.completion !== 'string') continue
    models.set(row.id, {
      id: row.id,
      name: typeof row.name === 'string' && row.name !== '' ? row.name : row.id,
      pricing: pricing,
    })
  }
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    if (typeof row.id !== 'string' || !row.id.startsWith('~deepseek/')) continue
    const target = row.alias_target
    if (target === null || typeof target !== 'object' || typeof target.slug !== 'string') continue
    if (!models.has(target.slug)) continue
    aliases.set(row.id, {
      id: row.id,
      name: typeof row.name === 'string' && row.name !== '' ? row.name : row.id,
      target: target.slug,
    })
  }
  return { models, aliases }
}

/** Resolve the concrete pricing row for one DSH model id. */
async function resolvePricingModel(ctx, pricing, catalogCache, provider, model) {
  const state = pricing.state()
  const aliasId = MODEL_ALIASES[model]
  if (aliasId !== undefined) {
    const alias = state.aliases.get(aliasId)
    if (alias !== undefined) {
      const target = state.models.get(alias.target)
      if (target !== undefined) return target
    }
  }
  const displayName = await modelDisplayName(ctx, catalogCache, provider, model)
  const wanted = significantTokens(displayName === undefined ? model : displayName)
  if (wanted.length === 0) return undefined
  const aliasCandidates = []
  for (const alias of state.aliases.values()) {
    const target = state.models.get(alias.target)
    if (target !== undefined) aliasCandidates.push(target)
  }
  const fromAliases = bestTokenMatch(aliasCandidates, wanted)
  if (fromAliases !== undefined) return fromAliases
  const concreteCandidates = []
  for (const entry of state.models.values()) {
    if (entry.id.endsWith(':batch')) continue
    concreteCandidates.push(entry)
  }
  return bestTokenMatch(concreteCandidates, wanted)
}

/** Prefer a candidate whose normalized name contains every meaningful model token. */
function bestTokenMatch(candidates, wanted) {
  let best
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const tokens = new Set(significantTokens(candidate.name))
    if (!wanted.every((token) => tokens.has(token))) continue
    if (tokens.size < bestScore) {
      best = candidate
      bestScore = tokens.size
    }
  }
  return best
}

/** Lowercase alphanumeric tokens; punctuation and the version dot split segments. */
function significantTokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(/\s+/)
    .flatMap((part) => part.split('.'))
    .filter((token) => token.length > 0)
}

/** Read the provider catalog's display name for one model; cached per provider. */
async function modelDisplayName(ctx, catalogCache, provider, model) {
  const cached = catalogCache.get(provider)
  if (cached !== undefined && Date.now() - cached.at < MODEL_CATALOG_TTL_MS) return cached.names.get(model)
  const llm = ctx.get('llm')
  if (llm === undefined || typeof llm.listModels !== 'function') return undefined
  try {
    const models = await llm.listModels(provider)
    const names = new Map()
    for (const info of models) {
      if (info !== null && typeof info === 'object' && typeof info.id === 'string') names.set(info.id, info.name)
    }
    catalogCache.set(provider, { at: Date.now(), names })
    return names.get(model)
  } catch (error) {
    return undefined
  }
}

/** Effective per-token prices for one concrete row at one request instant. */
function resolvePrice(pricing, at) {
  const selected = {
    prompt: toNumber(pricing.prompt),
    completion: toNumber(pricing.completion),
    cacheRead: pricing.input_cache_read === undefined ? undefined : toNumber(pricing.input_cache_read),
    cacheWrite: pricing.input_cache_write === undefined ? undefined : toNumber(pricing.input_cache_write),
  }
  const overrides = Array.isArray(pricing.overrides) ? pricing.overrides : []
  const atDate = new Date(typeof at === 'number' && Number.isFinite(at) ? at : Date.now())
  for (const override of overrides) {
    if (override === null || typeof override !== 'object') continue
    if (!overrideMatches(override, atDate)) continue
    if (override.prompt !== undefined) selected.prompt = toNumber(override.prompt)
    if (override.completion !== undefined) selected.completion = toNumber(override.completion)
    if (override.input_cache_read !== undefined) selected.cacheRead = toNumber(override.input_cache_read)
    if (override.input_cache_write !== undefined) selected.cacheWrite = toNumber(override.input_cache_write)
  }
  if (selected.cacheRead === undefined) selected.cacheRead = selected.prompt
  if (selected.cacheWrite === undefined) selected.cacheWrite = selected.prompt
  return selected
}

/** OpenRouter override condition: UTC weekday list plus one optional HHMM window. */
function overrideMatches(override, date) {
  if (Array.isArray(override.utc_days) && override.utc_days.length > 0) {
    if (!override.utc_days.includes(WEEKDAYS[date.getUTCDay()])) return false
  }
  const hasStart = typeof override.utc_start === 'number'
  const hasEnd = typeof override.utc_end === 'number'
  if (!hasStart && !hasEnd) return true
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  const start = hasStart ? clockMinutes(override.utc_start) : 0
  const end = hasEnd ? clockMinutes(override.utc_end) : 24 * 60
  if (start <= end) return minutes >= start && minutes < end
  return minutes >= start || minutes < end
}

/** HHMM clock number (`100`, `1030`, `0`) to minutes after midnight. */
function clockMinutes(value) {
  const numeric = toNumber(value)
  return Math.floor(numeric / 100) * 60 + (numeric % 100)
}

// ---------------------------------------------------------------------------
// Session cost
// ---------------------------------------------------------------------------

/** RPC entry: price one Session and its subagent descendants. */
async function readSessionCost(ctx, pricing, catalogCache, cache, payload, signal) {
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
  const byModel = new Map(root.byModel.map((entry) => [entry.provider + '\u0000' + entry.model, { ...entry }]))
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
        const key = entry.provider + '\u0000' + entry.model
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
    sessionId: sessionId,
    asOfSeq: root.asOfSeq,
    totalUsd: totalUsd,
    ownUsd: root.summary.totalUsd,
    subagentsUsd: totalUsd - root.summary.totalUsd,
    pricedCalls: pricedCalls,
    unpricedCalls: unpricedCalls,
    unpricedTokens: unpricedTokens,
    agents: agents,
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
  const cacheKey = String(observation.header.id) + '|' + String(asOfSeq) + '|' + String(inherited) + '|' + String(state.revision)
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const settlements = foldUsage(observation.events)
  const resolved = new Map()
  const unresolved = new Set()
  for (const settlement of settlements.values()) {
    if (settlement.seq < inherited) continue
    const key = settlement.provider + '\u0000' + settlement.model
    if (resolved.has(key) || unresolved.has(key)) continue
    const entry = await resolvePricingModel(ctx, pricing, catalogCache, settlement.provider, settlement.model)
    if (entry === undefined) unresolved.add(key)
    else resolved.set(key, entry)
  }

  const priced = priceSettlements(settlements, inherited, function (provider, model) {
    return resolved.get(provider + '\u0000' + model)
  })

  const result = {
    asOfSeq: asOfSeq,
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
function priceSettlements(settlements, inherited, entryFor) {
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
    const key = settlement.provider + '\u0000' + settlement.model
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
  return {
    totalUsd: totalUsd,
    pricedCalls: pricedCalls,
    unpricedCalls: unpricedCalls,
    unpricedTokens: unpricedTokens,
    byModel: Array.from(byModel.values()),
  }
}

/** Token buckets in the shape the price calculation uses. */
function usageBuckets(usage) {
  return {
    cacheRead: numberOrZero(usage.cacheReadTokens),
    input: numberOrZero(usage.inputTokens),
    cacheWrite: numberOrZero(usage.cacheWriteTokens),
    output: numberOrZero(usage.outputTokens),
  }
}

/** Mirror token-meter's settlement fold: one usage sample per turn/step, retries replace, attempts count. */
function foldUsage(events) {
  const header = { provider: '', model: '' }
  const steps = new Map()
  const settlements = new Map()
  const keyOf = (turn, step) => String(turn) + ':' + String(step)
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
      usage: usage,
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
    if (record === null || typeof record !== 'object') continue
    if (record.type !== 'chunk') continue
    const chunk = record.chunk
    if (chunk === null || chunk === undefined || typeof chunk !== 'object') continue
    if (chunk.type === 'usage' && chunk.usage !== null && typeof chunk.usage === 'object') return chunk.usage
  }
  return undefined
}

/** Observe one Session through the live-preferred query service. */
async function observeSession(query, sessionId, signal) {
  return query.observeSession(sessionId, { signal: signal, projectionMode: 'none' })
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
      const list = children.get(current) ?? []
      for (const header of list) {
        if (header.origin !== 'subagent') continue
        ids.push(header.id)
        queue.push(header.id)
      }
    }
  } catch (error) {}
  return ids
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function toNumber(value) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function describeError(error) {
  if (error === null || error === undefined) return 'unknown error'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message !== '') return error.message
  return String(error)
}

/** Pure helpers exercised by selftest.mjs. */
export const test = {
  createPricing: createPricing,
  readSessionCost: readSessionCost,
  parsePricing: parsePricing,
  resolvePrice: resolvePrice,
  overrideMatches: overrideMatches,
  foldUsage: foldUsage,
  usageBuckets: usageBuckets,
  priceSettlements: priceSettlements,
}
