/**
 * Main-thread Transformers.js client.
 *
 * ONNX Runtime's native Node binding cannot be loaded by a second worker
 * isolate after a plugin reload; keeping the pipelines in the Host process
 * avoids that failure. The model load is short for cached models; evaluation
 * stays inside the configured deadline and never crashes the Host on timeout.
 */

const DEFAULT_MODEL_TIMEOUT_MS = 50

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function modelErrorOf(error) {
  const message = messageOf(error)
  if (message.includes('Module did not self-register')) {
    return message + ' — restart DSH once so the ONNX native binding loads in the Host process'
  }
  return message
}

function withDeadline(work, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => finish(() => reject(Object.assign(new Error('inference cancelled'), { name: 'AbortError' })))
    const timer = setTimeout(() => finish(() => reject(new Error('inference timed out'))), Math.max(1, timeoutMs))
    if (signal !== undefined) {
      if (signal.aborted) {
        finish(() => reject(Object.assign(new Error('inference cancelled'), { name: 'AbortError' })))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    Promise.resolve(work).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
  })
}

function tensorData(output) {
  if (output === null || output === undefined) return undefined
  if (output.data !== null && output.data !== undefined) return Array.from(output.data)
  if (Array.isArray(output)) return output
  return undefined
}

export function createInferenceClient(config, options = {}) {
  const loadTransformers = options.loadTransformers ?? (() => import('@huggingface/transformers'))
  const onError = typeof options.onError === 'function' ? options.onError : () => {}
  const modelTimeoutMs = Number.isFinite(config.modelTimeoutMs) ? config.modelTimeoutMs : DEFAULT_MODEL_TIMEOUT_MS

  let disposed = false
  let ready = false
  let loading
  let lastError
  let embeddingPipeline
  let classifierPipeline
  let outputGuardPipeline
  let modelStates = {
    embedding: { state: config.embeddingEnabled === false ? 'disabled' : 'loading', error: null },
    classifier: { state: config.classifierEnabled === true ? 'loading' : 'disabled', error: null },
    outputGuard: { state: config.outputGuardEnabled === false ? 'disabled' : 'loading', error: null },
  }

  async function loadModels() {
    if (loading !== undefined) return loading
    loading = (async () => {
      let module
      try {
        module = await loadTransformers()
      } catch (error) {
        const message = modelErrorOf(error)
        for (const key of ['embedding', 'classifier']) {
          if (modelStates[key].state !== 'disabled') modelStates[key] = { state: 'error', error: message }
        }
        lastError = message
        onError(error)
        return modelStates
      }
      const env = module.env
      if (env !== undefined) {
        env.allowRemoteModels = config.allowRemoteModels !== false
        env.allowLocalModels = true
        if (typeof options.cacheDir === 'string' && options.cacheDir !== '') env.cacheDir = options.cacheDir
      }
      const pipeline = module.pipeline
      if (config.embeddingEnabled) {
        modelStates.embedding = { state: 'loading', error: null }
        try {
          embeddingPipeline = await pipeline('feature-extraction', config.embeddingModel, {
            device: 'cpu',
            dtype: 'q8',
            revision: config.embeddingRevision,
          })
          modelStates.embedding = { state: 'ready', error: null }
        } catch (error) {
          embeddingPipeline = undefined
          modelStates.embedding = { state: 'error', error: modelErrorOf(error) }
        }
      }
      if (config.classifierEnabled) {
        if (typeof config.classifierModel !== 'string' || config.classifierModel === ''
          || typeof config.classifierRevision !== 'string' || config.classifierRevision === '') {
          modelStates.classifier = { state: 'error', error: 'classifier model and revision are required' }
        } else {
          modelStates.classifier = { state: 'loading', error: null }
          try {
            classifierPipeline = await pipeline('text-classification', config.classifierModel, {
              device: 'cpu',
              dtype: 'q8',
              revision: config.classifierRevision,
            })
            modelStates.classifier = { state: 'ready', error: null }
          } catch (error) {
            classifierPipeline = undefined
            modelStates.classifier = { state: 'error', error: modelErrorOf(error) }
          }
        }
      }
      if (config.outputGuardEnabled) {
        if (typeof config.outputGuardModel !== 'string' || config.outputGuardModel === ''
          || typeof config.outputGuardRevision !== 'string' || config.outputGuardRevision === '') {
          modelStates.outputGuard = { state: 'error', error: 'output guard model and revision are required' }
        } else {
          modelStates.outputGuard = { state: 'loading', error: null }
          try {
            outputGuardPipeline = await pipeline('text-classification', config.outputGuardModel, {
              device: 'cpu',
              dtype: 'q8',
              revision: config.outputGuardRevision,
            })
            modelStates.outputGuard = { state: 'ready', error: null }
          } catch (error) {
            outputGuardPipeline = undefined
            modelStates.outputGuard = { state: 'error', error: modelErrorOf(error) }
          }
        }
      }
      const errors = []
      for (const key of ['embedding', 'classifier', 'outputGuard']) {
        if (modelStates[key].state === 'error') errors.push(key + ': ' + String(modelStates[key].error ?? 'unknown error'))
      }
      lastError = errors.length > 0 ? errors.join('; ') : undefined
      if (errors.length > 0) onError(new Error(lastError))
      return modelStates
    })()
    return loading
  }

  async function warmup() {
    if (disposed) throw new Error('inference client disposed')
    if (ready) return
    await loadModels()
    ready = true
  }

  async function evaluate(command, description, signal) {
    if (disposed) throw new Error('inference client disposed')
    if (!ready) {
      void warmup().catch(() => {})
      throw new Error('inference models are not ready')
    }
    const errorOf = (key) => {
      const state = modelStates[key]
      return state.state === 'error' ? ': ' + String(state.error ?? 'unknown error') : ''
    }
    if (config.embeddingEnabled && modelStates.embedding.state !== 'ready') {
      throw new Error('embedding model ' + modelStates.embedding.state + errorOf('embedding'))
    }
    if (config.classifierEnabled && modelStates.classifier.state !== 'ready') {
      throw new Error('classifier model ' + modelStates.classifier.state + errorOf('classifier'))
    }
    const work = (async () => {
      const commandEmbedding = config.embeddingEnabled
        ? tensorData(await embeddingPipeline(command, {
          pooling: 'mean',
          normalize: true,
          truncation: true,
          max_length: config.maxTextTokens,
        }))
        : undefined
      const descriptionEmbedding = config.embeddingEnabled && description !== undefined
        ? tensorData(await embeddingPipeline(description, {
          pooling: 'mean',
          normalize: true,
          truncation: true,
          max_length: config.maxTextTokens,
        }))
        : undefined
      let maliceScore
      if (config.classifierEnabled) {
        const output = await classifierPipeline(command, {
          truncation: true,
          max_length: config.maxTextTokens,
        })
        const rows = Array.isArray(output) ? output : [output]
        const wanted = new Set((config.classifierLabels ?? []).map((label) => String(label).toUpperCase()))
        for (const row of rows) {
          if (row === null || row === undefined) continue
          if (!wanted.has(String(row.label ?? '').toUpperCase())) continue
          const score = Number(row.score)
          if (Number.isFinite(score)) maliceScore = Math.max(maliceScore ?? 0, Math.min(1, Math.max(0, score)))
        }
        if (maliceScore === undefined) throw new Error('classifier returned no configured hostile label')
      }
      return { commandEmbedding, descriptionEmbedding, maliceScore }
    })()
    return withDeadline(work, modelTimeoutMs, signal)
  }

  async function evaluateOutput(text, signal) {
    if (disposed) throw new Error('inference client disposed')
    if (!config.outputGuardEnabled) return { score: 0, disabled: true, chunks: 0, truncated: false }
    if (!ready) {
      void warmup().catch(() => {})
      throw new Error('inference models are not ready')
    }
    const state = modelStates.outputGuard
    if (state.state !== 'ready') {
      throw new Error('output guard model ' + state.state + (state.error ? ': ' + state.error : ''))
    }
    const source = typeof text === 'string' ? text : ''
    const maxChars = Math.max(256, config.outputGuardMaxChars)
    const chunkChars = Math.max(256, Math.min(config.outputGuardChunkChars, maxChars))
    const chunks = []
    for (let offset = 0; offset < source.length && offset < maxChars; offset += chunkChars) {
      chunks.push(source.slice(offset, Math.min(source.length, offset + chunkChars, maxChars)))
    }
    const labels = new Set((config.outputGuardLabels ?? []).map((label) => String(label).toUpperCase()))
    const work = (async () => {
      let score = 0
      for (const chunk of chunks) {
        const output = await outputGuardPipeline(chunk, {
          truncation: true,
          max_length: config.maxTextTokens,
        })
        const rows = Array.isArray(output) ? output : [output]
        for (const row of rows) {
          if (row === null || row === undefined) continue
          if (!labels.has(String(row.label ?? '').toUpperCase())) continue
          const value = Number(row.score)
          if (Number.isFinite(value)) score = Math.max(score, Math.min(1, Math.max(0, value)))
        }
      }
      return { score, chunks: chunks.length, truncated: source.length > maxChars }
    })()
    return withDeadline(work, Math.max(10, config.outputGuardTimeoutMs ?? 2000), signal)
  }

  function start() {
    if (disposed) return
    void warmup().catch(() => {})
  }

  function dispose() {
    disposed = true
    ready = false
    loading = undefined
    for (const pipeline of [embeddingPipeline, classifierPipeline, outputGuardPipeline]) {
      try {
        pipeline?.dispose?.()
      } catch (error) {}
    }
    embeddingPipeline = undefined
    classifierPipeline = undefined
    outputGuardPipeline = undefined
  }

  return {
    start,
    evaluate,
    evaluateOutput,
    warmup,
    dispose,
    get ready() { return ready },
    get lastError() { return lastError },
    get models() { return modelStates },
  }
}
