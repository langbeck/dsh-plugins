/**
 * OpenRouter pricing for DeepSeek models.
 *
 * The public model list is fetched at startup and every configured interval.
 * Each concrete `deepseek/*` row carries per-token USD prices and optional
 * weekday/time `overrides`. DSH model ids map through the `~deepseek/*-latest`
 * aliases to the concrete row those aliases currently target.
 */

import { describeError, toNumber } from './util.js'

const PRICING_URL = 'https://openrouter.ai/api/v1/models?model_authors=deepseek'
const PRICING_TIMEOUT_MS = 15_000
const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** DSH model id → OpenRouter alias whose target is the served release. */
const MODEL_ALIASES = {
  'deepseek-flash': '~deepseek/deepseek-flash-latest',
  'deepseek-v4-pro': '~deepseek/deepseek-pro-latest',
}

export function createPricing(refreshSeconds) {
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

/** Split one OpenRouter models response into concrete DeepSeek rows and aliases. */
export function parsePricing(body) {
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
      pricing,
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
export async function resolvePricingModel(ctx, pricing, catalogCache, provider, model) {
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
export function resolvePrice(pricing, at) {
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
export function overrideMatches(override, date) {
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
