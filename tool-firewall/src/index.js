/**
 * DSH Tool Firewall — Host half.
 *
 * Inspects every `tools/pre-execute` call before the tool body runs. A
 * deterministic structural analyzer always runs; optional Transformers.js
 * embeddings/classification run in the Host process.
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
  OUTPUT_GUARD_FAILURE_MODES,
  OUTPUT_GUARD_MODES,
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
const OUTPUT_INSPECT_CHARS = 8000

function redactSecrets(value) {
  return value
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '[redacted]')
    .replace(/((?:password|passwd|token|secret|api[_-]?key|authorization)\s*[=:]\s*)(["']?)[^\s"']+/gi, '$1$2[redacted]')
}

function preview(value) {
  if (typeof value !== 'string' || value === '') return ''
  return redactSecrets(value.slice(0, LOG_PREVIEW_CHARS))
}

function inspectionPreview(value) {
  if (typeof value !== 'string' || value === '') return ''
  return redactSecrets(value.slice(0, OUTPUT_INSPECT_CHARS))
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
  outputGuardEnabled: Schema.boolean().default(DEFAULT_CONFIG.outputGuardEnabled).volatile(),
  outputGuardModel: Schema.string().default(DEFAULT_CONFIG.outputGuardModel).volatile(),
  outputGuardRevision: Schema.string().default(DEFAULT_CONFIG.outputGuardRevision).volatile(),
  outputGuardLabels: Schema.array(Schema.string()).default([...DEFAULT_CONFIG.outputGuardLabels]).volatile(),
  outputGuardThreshold: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.outputGuardThreshold).volatile(),
  outputGuardTools: Schema.array(Schema.string()).default([...DEFAULT_CONFIG.outputGuardTools]).volatile(),
  outputGuardMode: Schema.union(OUTPUT_GUARD_MODES.map((mode) => Schema.const(mode))).default(DEFAULT_CONFIG.outputGuardMode).volatile(),
  outputGuardMaxChars: Schema.number().min(256).max(200000).step(1).default(DEFAULT_CONFIG.outputGuardMaxChars).volatile(),
  outputGuardChunkChars: Schema.number().min(256).max(16000).step(1).default(DEFAULT_CONFIG.outputGuardChunkChars).volatile(),
  outputGuardTimeoutMs: Schema.number().min(10).max(5000).step(1).default(DEFAULT_CONFIG.outputGuardTimeoutMs).volatile(),
  outputGuardFailureMode: Schema.union(OUTPUT_GUARD_FAILURE_MODES.map((mode) => Schema.const(mode))).default(DEFAULT_CONFIG.outputGuardFailureMode).volatile(),
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
    evaluateOutput() {
      return Promise.reject(new Error('inference is disabled'))
    },
    dispose() {},
  }
}

function textContent(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

export function apply(ctx, config) {
  const logger = ctx.logger
  const startedAt = Date.now()
  const counters = { total: 0, blocked: 0, outputsScanned: 0, outputsBlocked: 0 }
  const logs = []
  let logSeq = 0
  let runtime

  function recordOutput({ tool, scan, action, durationMs, text, failure, threshold }) {
    const score = typeof scan?.score === 'number' ? scan.score : undefined
    const reason = action === 'allow'
      ? ''
      : failure !== undefined
        ? 'output guard unavailable: ' + preview(failure) + '; result withheld'
        : 'injection score ' + (score === undefined ? 'unavailable' : score.toFixed(3)) + ' >= threshold ' + Number(threshold).toFixed(3)
    logs.unshift({
      id: ++logSeq,
      at: Date.now(),
      phase: 'output',
      tool,
      command: '',
      description: '',
      blocked: action !== 'allow',
      code: action === 'allow' ? undefined : 'TOOL_FIREWALL_OUTPUT_BLOCKED',
      reason,
      outputScore: score,
      outputThreshold: threshold,
      outputFailure: failure === undefined ? undefined : preview(failure),
      outputExcerpt: action === 'allow' ? undefined : inspectionPreview(text),
      chunks: scan?.chunks,
      truncated: scan?.truncated === true,
      action,
      durationMs: Math.max(0, Math.round(durationMs)),
    })
    if (logs.length > LOG_LIMIT) logs.length = LOG_LIMIT
  }

  function recordInspection({ payload, decision, durationMs }) {
    const scores = decision.scores ?? {}
    const structural = decision.structural ?? {}
    logs.unshift({
      id: ++logSeq,
      at: Date.now(),
      phase: 'input',
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
    const needsInference = resolved.enabled && (resolved.embeddingEnabled || resolved.classifierEnabled || resolved.outputGuardEnabled)
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

  ctx.effect(() => ctx.on('tools/post-execute', async (exec, result, next) => {
    const downstream = await next()
    if (downstream.kind !== 'accept') return downstream
    if (runtime === undefined || !runtime.config.enabled || !runtime.config.outputGuardEnabled) return downstream
    if (!runtime.config.outputGuardTools.includes(exec.name)) return downstream
    if (result.isError === true) return downstream
    const content = downstream.content !== undefined ? downstream.content : result.content
    const text = textContent(content)
    if (text.trim() === '') return downstream
    const started = Date.now()
    counters.outputsScanned += 1
    let scan
    try {
      scan = await runtime.inference.evaluateOutput(text, exec.signal)
    } catch (error) {
      const action = runtime.config.outputGuardFailureMode === 'closed' ? 'quarantine' : 'allow'
      if (action === 'quarantine') counters.outputsBlocked += 1
      recordOutput({ tool: exec.name, scan: { score: undefined, chunks: 0, truncated: false }, action, durationMs: Date.now() - started, text, failure: describeError(error), threshold: runtime.config.outputGuardThreshold })
      if (action === 'allow') return downstream
      return {
        kind: 'accept',
        content: [{ type: 'text', text: '[Tool output withheld: output guard unavailable.]' }],
      }
    }
    const suspicious = typeof scan.score === 'number' && scan.score >= runtime.config.outputGuardThreshold
    if (!suspicious) {
      recordOutput({ tool: exec.name, scan, action: 'allow', durationMs: Date.now() - started })
      return downstream
    }
    const mode = runtime.config.outputGuardMode
    recordOutput({ tool: exec.name, scan, action: mode, durationMs: Date.now() - started, text, threshold: runtime.config.outputGuardThreshold })
    if (mode === 'block') {
      counters.outputsBlocked += 1
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: '[Tool output blocked: potential prompt injection detected.]' }],
      }
    }
    counters.outputsBlocked += 1
    return {
      kind: 'accept',
      content: [{ type: 'text', text: '[Tool output withheld: potential prompt injection detected. Original content was not shown.]' }],
    }
  }), 'tool-firewall: output guard')

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
          outputsScanned: counters.outputsScanned,
          outputsBlocked: counters.outputsBlocked,
          enabled: runtime?.config.enabled === true,
          modelReady: runtime?.inference.ready === true,
          modelError: runtime?.inference.lastError ?? null,
          models: runtime?.inference.models ?? null,
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
          outputsScanned: counters.outputsScanned,
          outputsBlocked: counters.outputsBlocked,
          modelReady: runtime?.inference.ready === true,
          modelError: runtime?.inference.lastError ?? null,
          models: runtime?.inference.models ?? null,
          startedAt,
        },
      }),
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'tool-firewall: logs route')
}
