/** Shared defaults and normalization for the tool firewall Host and Client halves. */

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  maliceThreshold: 0.85,
  alignmentThreshold: 0.35,
  bypassRegex: '^(?:ls|git status|git branch|pwd)$',
  shellTools: Object.freeze(['bash', 'pwsh', 'terminal_send', 'run_code']),
  maxCommandChars: 8192,
  maxTextTokens: 256,
  embeddingEnabled: true,
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  embeddingRevision: '751bff37182d3f1213fa05d7196b954e230abad9',
  classifierEnabled: false,
  classifierModel: '',
  classifierRevision: '',
  classifierLabels: Object.freeze(['MALICIOUS', 'LABEL_1']),
  modelTimeoutMs: 50,
  semanticFailure: 'open',
  cacheEntries: 256,
  cacheTtlMs: 600000,
  allowRemoteModels: true,
  outputGuardEnabled: true,
  outputGuardModel: 'Horizon-Labs/prompt-injection-guard-small',
  outputGuardRevision: '1b7c40f4a5fdbf9622d20372ead279e65d4c7fc9',
  outputGuardLabels: Object.freeze(['INJECTION']),
  outputGuardThreshold: 0.8,
  outputGuardTools: Object.freeze(['web_search', 'web_fetch', 'skill']),
  outputGuardMode: 'quarantine',
  outputGuardMaxChars: 8000,
  outputGuardChunkChars: 1200,
  outputGuardTimeoutMs: 2000,
  outputGuardFailureMode: 'open',
})

export const SEMANTIC_FAILURE_MODES = Object.freeze(['open', 'closed'])
export const MAX_COMMAND_CHARS = 65536
export const MAX_TEXT_TOKENS = 512
export const MAX_TIMEOUT_MS = 5000
export const MAX_CACHE_ENTRIES = 4096
export const MAX_CACHE_TTL_MS = 86_400_000
export const OUTPUT_GUARD_MODES = Object.freeze(['quarantine', 'block'])
export const OUTPUT_GUARD_FAILURE_MODES = Object.freeze(['open', 'closed'])

/** Resolve schemastery volatile Config references into plain values. */
export function unrefConfig(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const out = {}
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const raw = source[key]
    out[key] = raw !== null && raw !== undefined && typeof raw.get === 'function' ? raw.get() : raw
  }
  return out
}

function clampNumber(value, fallback, min, max, integer = false) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  const rounded = integer ? Math.round(numeric) : numeric
  return Math.min(max, Math.max(min, rounded))
}

function normalizeString(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function normalizeStringList(value, fallback) {
  let entries
  if (Array.isArray(value)) entries = value
  else if (typeof value === 'string') entries = value.split(',')
  else entries = fallback
  const out = []
  for (const entry of entries) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed === '') continue
    if (!out.includes(trimmed)) out.push(trimmed)
  }
  return out.length > 0 ? out : [...fallback]
}

/** Validate one effective config; throws on values the Host cannot safely apply. */
export function validateConfig(value) {
  const normalized = normalizeConfig(value)
  if (normalized.bypassRegex !== '') {
    let pattern
    try {
      pattern = new RegExp(normalized.bypassRegex)
    } catch (error) {
      throw new Error('bypassRegex is not a valid regular expression')
    }
    if (pattern.test('')) throw new Error('bypassRegex must not match an empty command')
  }
  if (normalized.classifierEnabled) {
    if (normalized.classifierModel.trim() === '') throw new Error('classifierModel is required when classifierEnabled is true')
    if (normalized.classifierRevision.trim() === '') throw new Error('classifierRevision is required when classifierEnabled is true')
  }
  if (normalized.outputGuardEnabled) {
    if (normalized.outputGuardModel.trim() === '') throw new Error('outputGuardModel is required when outputGuardEnabled is true')
    if (normalized.outputGuardRevision.trim() === '') throw new Error('outputGuardRevision is required when outputGuardEnabled is true')
  }
  return normalized
}

/** Normalize a partial or invalid config into a usable one. */
export function normalizeConfig(value) {
  const source = unrefConfig(value)
  return {
    enabled: source.enabled !== false,
    maliceThreshold: clampNumber(source.maliceThreshold, DEFAULT_CONFIG.maliceThreshold, 0, 1),
    alignmentThreshold: clampNumber(source.alignmentThreshold, DEFAULT_CONFIG.alignmentThreshold, 0, 1),
    bypassRegex: normalizeString(source.bypassRegex, DEFAULT_CONFIG.bypassRegex),
    shellTools: normalizeStringList(source.shellTools, DEFAULT_CONFIG.shellTools),
    maxCommandChars: clampNumber(source.maxCommandChars, DEFAULT_CONFIG.maxCommandChars, 64, MAX_COMMAND_CHARS, true),
    maxTextTokens: clampNumber(source.maxTextTokens, DEFAULT_CONFIG.maxTextTokens, 16, MAX_TEXT_TOKENS, true),
    embeddingEnabled: source.embeddingEnabled !== false,
    embeddingModel: normalizeString(source.embeddingModel, DEFAULT_CONFIG.embeddingModel),
    embeddingRevision: normalizeString(source.embeddingRevision, DEFAULT_CONFIG.embeddingRevision),
    classifierEnabled: source.classifierEnabled === true,
    classifierModel: normalizeString(source.classifierModel, DEFAULT_CONFIG.classifierModel),
    classifierRevision: normalizeString(source.classifierRevision, DEFAULT_CONFIG.classifierRevision),
    classifierLabels: normalizeStringList(source.classifierLabels, DEFAULT_CONFIG.classifierLabels),
    modelTimeoutMs: clampNumber(source.modelTimeoutMs, DEFAULT_CONFIG.modelTimeoutMs, 1, MAX_TIMEOUT_MS, true),
    semanticFailure: SEMANTIC_FAILURE_MODES.includes(source.semanticFailure) ? source.semanticFailure : DEFAULT_CONFIG.semanticFailure,
    cacheEntries: clampNumber(source.cacheEntries, DEFAULT_CONFIG.cacheEntries, 1, MAX_CACHE_ENTRIES, true),
    cacheTtlMs: clampNumber(source.cacheTtlMs, DEFAULT_CONFIG.cacheTtlMs, 1000, MAX_CACHE_TTL_MS, true),
    allowRemoteModels: source.allowRemoteModels !== false,
    outputGuardEnabled: source.outputGuardEnabled !== false,
    outputGuardModel: normalizeString(source.outputGuardModel, DEFAULT_CONFIG.outputGuardModel),
    outputGuardRevision: normalizeString(source.outputGuardRevision, DEFAULT_CONFIG.outputGuardRevision),
    outputGuardLabels: normalizeStringList(source.outputGuardLabels, DEFAULT_CONFIG.outputGuardLabels),
    outputGuardThreshold: clampNumber(source.outputGuardThreshold, DEFAULT_CONFIG.outputGuardThreshold, 0, 1),
    outputGuardTools: normalizeStringList(source.outputGuardTools, DEFAULT_CONFIG.outputGuardTools),
    outputGuardMode: OUTPUT_GUARD_MODES.includes(source.outputGuardMode) ? source.outputGuardMode : DEFAULT_CONFIG.outputGuardMode,
    outputGuardMaxChars: clampNumber(source.outputGuardMaxChars, DEFAULT_CONFIG.outputGuardMaxChars, 256, 200000, true),
    outputGuardChunkChars: clampNumber(source.outputGuardChunkChars, DEFAULT_CONFIG.outputGuardChunkChars, 256, 16000, true),
    outputGuardTimeoutMs: clampNumber(source.outputGuardTimeoutMs, DEFAULT_CONFIG.outputGuardTimeoutMs, 10, 5000, true),
    outputGuardFailureMode: OUTPUT_GUARD_FAILURE_MODES.includes(source.outputGuardFailureMode) ? source.outputGuardFailureMode : DEFAULT_CONFIG.outputGuardFailureMode,
  }
}
