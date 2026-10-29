/**
 * DSH Tool Firewall — Host half.
 *
 * Inspects every `tools/pre-execute` call before the tool body runs. A
 * deterministic structural analyzer always runs; optional Transformers.js
 * embeddings/classification run in an in-process worker.
 *
 * The entire Config object is volatile: the Plugin Manager form writes fields
 * live, and `loader/volatile-update` rebuilds the evaluator without restarting
 * the Host.
 */

import Schema from '@deepseek-ai/schemastery'
import { dshCachePath } from '@deepseek-ai/dsh-home-paths'

import {
  DEFAULT_CONFIG,
  MAX_CACHE_ENTRIES,
  MAX_CACHE_TTL_MS,
  MAX_COMMAND_CHARS,
  MAX_TEXT_TOKENS,
  MAX_TIMEOUT_MS,
  SEMANTIC_FAILURE_MODES,
  unrefConfig,
  validateConfig,
} from './config.js'
import { createDecisionCache } from './host/cache.js'
import { createGateHandler } from './host/gate.js'
import { createInferenceClient } from './host/inference-client.js'

export const name = 'tool-firewall'

export const inject = ['tools', 'connection']

const STATS_ROUTE = '/api/tool-firewall-stats'
const LOGS_ROUTE = '/api/tool-firewall-logs'
const LOG_LIMIT = 200
const LOG_PREVIEW_CHARS = 400

function preview(value) {
  if (typeof value !== 'string' || value === '') return ''
  return value
    .slice(0, LOG_PREVIEW_CHARS)
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '[redacted]')
    .replace(/((?:password|passwd|token|secret|api[_-]?key|authorization)\s*[=:]\s*)(["']?)[^\s"']+/gi, '$1$2[redacted]')
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).volatile(),
  maliceThreshold: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.maliceThreshold).volatile(),
  alignmentThreshold: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.alignmentThreshold).volatile(),
  bypassRegex: Schema.string().default(DEFAULT_CONFIG.bypassRegex).volatile(),
  shellTools: Schema.array(Schema.string()).default([...DEFAULT_CONFIG.shellTools]).volatile(),
  maxCommandChars: Schema.number().min(64).max(MAX_COMMAND_CHARS).step(1).default(DEFAULT_CONFIG.maxCommandChars).volatile(),
  maxTextTokens: Schema.number().min(16).max(MAX_TEXT_TOKENS).step(1).default(DEFAULT_CONFIG.maxTextTokens).volatile(),
  embeddingEnabled: Schema.boolean().default(DEFAULT_CONFIG.embeddingEnabled).volatile(),
  embeddingModel: Schema.string().default(DEFAULT_CONFIG.embeddingModel).volatile(),
  embeddingRevision: Schema.string().default(DEFAULT_CONFIG.embeddingRevision).volatile(),
  classifierEnabled: Schema.boolean().default(DEFAULT_CONFIG.classifierEnabled).volatile(),
  classifierModel: Schema.string().default(DEFAULT_CONFIG.classifierModel).volatile(),
  classifierRevision: Schema.string().default(DEFAULT_CONFIG.classifierRevision).volatile(),
  classifierLabels: Schema.array(Schema.string()).default([...DEFAULT_CONFIG.classifierLabels]).volatile(),
  modelTimeoutMs: Schema.number().min(1).max(MAX_TIMEOUT_MS).step(1).default(DEFAULT_CONFIG.modelTimeoutMs).volatile(),
  semanticFailure: Schema.union(SEMANTIC_FAILURE_MODES.map((mode) => Schema.const(mode))).default(DEFAULT_CONFIG.semanticFailure).volatile(),
  cacheEntries: Schema.number().min(1).max(MAX_CACHE_ENTRIES).step(1).default(DEFAULT_CONFIG.cacheEntries).volatile(),
  cacheTtlMs: Schema.number().min(1000).max(MAX_CACHE_TTL_MS).step(1).default(DEFAULT_CONFIG.cacheTtlMs).volatile(),
  allowRemoteModels: Schema.boolean().default(DEFAULT_CONFIG.allowRemoteModels).volatile(),
})

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function nullInference() {
  return {
    ready: false,
    start() {},
    evaluate() {
      return Promise.reject(new Error('inference is disabled'))
    },
    dispose() {},
  }
}

export function apply(ctx, config) {
  const logger = ctx.logger
  const startedAt = Date.now()
  const counters = { total: 0, blocked: 0 }
  const logs = []
  let logSeq = 0
  let runtime

  function recordInspection({ payload, decision, durationMs }) {
    const scores = decision.scores ?? {}
    const structural = decision.structural ?? {}
    logs.unshift({
      id: ++logSeq,
      at: Date.now(),
      tool: payload.name,
      kind: payload.kind,
      command: preview(payload.command),
      description: payload.description === null ? '' : preview(payload.description),
      blocked: decision.blocked === true,
      code: decision.info?.code,
      reason: preview(decision.reason ?? decision.error ?? ''),
      structural: typeof scores.structural === 'number' ? scores.structural : structural.score,
      hardBlock: structural.hardBlock === true,
      reasons: Array.isArray(structural.reasons) ? structural.reasons.slice(0, 6) : [],
      malice: scores.malice,
      alignment: scores.alignment,
      classifier: scores.classifier,
      bypass: decision.bypass === true,
      cached: decision.cached === true,
      semanticUnavailable: decision.semanticUnavailable === true,
      durationMs: Math.max(0, Math.round(durationMs)),
    })
    if (logs.length > LOG_LIMIT) logs.length = LOG_LIMIT
  }

  function currentConfig() {
    try {
      const live = ctx.fiber?.config
      if (live !== null && live !== undefined && typeof live === 'object') return unrefConfig(live)
    } catch (error) {}
    return unrefConfig(config)
  }

  function buildRuntime(value) {
    const resolved = validateConfig(value)
    const cache = createDecisionCache(resolved.cacheEntries, resolved.cacheTtlMs)
    const needsInference = resolved.enabled && (resolved.embeddingEnabled || resolved.classifierEnabled)
    const inference = needsInference
      ? createInferenceClient(resolved, {
        cacheDir: dshCachePath('tool-firewall', 'models'),
        onError: (error) => {
          try {
            logger?.warn?.('tool-firewall: inference unavailable: ' + describeError(error))
          } catch (failure) {}
        },
      })
      : nullInference()
    inference.start()
    return { config: resolved, cache, inference }
  }

  let handlePreExecute
  function activate(value) {
    const previous = runtime
    const next = buildRuntime(value)
    runtime = next
    handlePreExecute = createGateHandler({
      tools: ctx.tools,
      config: next.config,
      inference: next.inference,
      cache: next.cache,
      logger,
      onInspected: recordInspection,
    })
    if (previous !== undefined) {
      previous.inference.dispose()
      previous.cache.clear()
    }
  }

  activate(currentConfig())

  ctx.effect(() => () => {
    if (runtime !== undefined) {
      runtime.inference.dispose()
      runtime.cache.clear()
    }
  }, 'tool-firewall: inference lifecycle')

  ctx.effect(() => ctx.on('loader/volatile-update', () => {
    try {
      const next = currentConfig()
      if (runtime !== undefined) {
        const current = runtime.config
        const candidate = validateConfig(next)
        if (JSON.stringify(current) === JSON.stringify(candidate)) return
      }
      activate(next)
    } catch (error) {
      logger?.warn?.('tool-firewall: rejected settings update: ' + describeError(error))
    }
  }), 'tool-firewall: settings refresh')

  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    if (runtime === undefined || !runtime.config.enabled) return handlePreExecute(exec, next)
    counters.total += 1
    const decision = await handlePreExecute(exec, next)
    if (decision.kind === 'deny' && String(decision.info?.code ?? '').startsWith('TOOL_FIREWALL_')) {
      counters.blocked += 1
    }
    return decision
  }, { prepend: true }), 'tool-firewall: pre-execute gate')

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: STATS_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => Response.json({
        ok: true,
        value: {
          total: counters.total,
          blocked: counters.blocked,
          enabled: runtime?.config.enabled === true,
          modelReady: runtime?.inference.ready === true,
          modelError: runtime?.inference.lastError ?? null,
          startedAt,
        },
      }),
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'tool-firewall: stats route')

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: LOGS_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => Response.json({
        ok: true,
        value: {
          logs,
          total: counters.total,
          blocked: counters.blocked,
          modelReady: runtime?.inference.ready === true,
          modelError: runtime?.inference.lastError ?? null,
          startedAt,
        },
      }),
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'tool-firewall: logs route')
}
