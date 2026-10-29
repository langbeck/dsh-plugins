/**
 * DSH Tool Firewall — Host half.
 *
 * Inspects every `tools/pre-execute` call before the tool body runs. A
 * deterministic structural analyzer always runs; optional Transformers.js
 * embeddings/classification run in an in-process worker.
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
  validateConfig,
} from './config.js'
import { createDecisionCache } from './host/cache.js'
import { createGateHandler } from './host/gate.js'
import { createInferenceClient } from './host/inference-client.js'

export const name = 'tool-firewall'

export const inject = ['tools']

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled),
  maliceThreshold: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.maliceThreshold),
  alignmentThreshold: Schema.number().min(0).max(1).default(DEFAULT_CONFIG.alignmentThreshold),
  bypassRegex: Schema.string().default(DEFAULT_CONFIG.bypassRegex),
  shellTools: Schema.array(Schema.string()).default([...DEFAULT_CONFIG.shellTools]),
  maxCommandChars: Schema.number().min(64).max(MAX_COMMAND_CHARS).step(1).default(DEFAULT_CONFIG.maxCommandChars),
  maxTextTokens: Schema.number().min(16).max(MAX_TEXT_TOKENS).step(1).default(DEFAULT_CONFIG.maxTextTokens),
  embeddingEnabled: Schema.boolean().default(DEFAULT_CONFIG.embeddingEnabled),
  embeddingModel: Schema.string().default(DEFAULT_CONFIG.embeddingModel),
  embeddingRevision: Schema.string().default(DEFAULT_CONFIG.embeddingRevision),
  classifierEnabled: Schema.boolean().default(DEFAULT_CONFIG.classifierEnabled),
  classifierModel: Schema.string().default(DEFAULT_CONFIG.classifierModel),
  classifierRevision: Schema.string().default(DEFAULT_CONFIG.classifierRevision),
  classifierLabels: Schema.array(Schema.string()).default([...DEFAULT_CONFIG.classifierLabels]),
  modelTimeoutMs: Schema.number().min(1).max(MAX_TIMEOUT_MS).step(1).default(DEFAULT_CONFIG.modelTimeoutMs),
  semanticFailure: Schema.union(SEMANTIC_FAILURE_MODES.map((mode) => Schema.const(mode))).default(DEFAULT_CONFIG.semanticFailure),
  cacheEntries: Schema.number().min(1).max(MAX_CACHE_ENTRIES).step(1).default(DEFAULT_CONFIG.cacheEntries),
  cacheTtlMs: Schema.number().min(1000).max(MAX_CACHE_TTL_MS).step(1).default(DEFAULT_CONFIG.cacheTtlMs),
  allowRemoteModels: Schema.boolean().default(DEFAULT_CONFIG.allowRemoteModels),
})

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

export function apply(ctx, config) {
  const resolved = validateConfig(config)
  const cache = createDecisionCache(resolved.cacheEntries, resolved.cacheTtlMs)
  const logger = ctx.logger

  const inference = createInferenceClient(resolved, {
    cacheDir: dshCachePath('tool-firewall', 'models'),
    onError: (error) => {
      try {
        logger?.warn?.('tool-firewall: inference unavailable: ' + describeError(error))
      } catch (failure) {}
    },
  })
  inference.start()

  ctx.effect(() => () => {
    inference.dispose()
    cache.clear()
  }, 'tool-firewall: inference lifecycle')

  const handlePreExecute = createGateHandler({
    tools: ctx.tools,
    config: resolved,
    inference,
    cache,
    logger,
  })

  ctx.effect(() => ctx.on('tools/pre-execute', handlePreExecute, { prepend: true }), 'tool-firewall: pre-execute gate')
}
