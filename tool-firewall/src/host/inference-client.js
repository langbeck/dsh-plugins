/**
 * Parent-side client for the in-process inference worker.
 *
 * The worker owns Transformers.js and model loading. This client owns warmup,
 * one-at-a-time evaluation, deadlines, cancellation, and worker restarts.
 */

import { Worker } from 'node:worker_threads'

const WARMUP_TIMEOUT_MS = 180_000

function abortError() {
  const error = new Error('inference cancelled')
  error.name = 'AbortError'
  return error
}

export function createInferenceClient(config, options = {}) {
  const WorkerCtor = options.Worker ?? Worker
  const workerUrl = options.workerUrl ?? new URL('./inference-worker.js', import.meta.url)
  const warmupTimeoutMs = Number.isFinite(options.warmupTimeoutMs) ? options.warmupTimeoutMs : WARMUP_TIMEOUT_MS
  const onError = typeof options.onError === 'function' ? options.onError : () => {}

  let worker
  let disposed = false
  let ready = false
  let readyPromise
  let lastError
  let retryTimer
  let retryDelayMs = 5000
  let nextId = 1
  let pending = new Map()
  let tail = Promise.resolve()

  function scheduleRetry() {
    if (disposed || retryTimer !== undefined) return
    const delay = retryDelayMs
    retryDelayMs = Math.min(60_000, retryDelayMs * 2)
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      start()
    }, delay)
  }

  function workerData() {
    return {
      embeddingEnabled: config.embeddingEnabled,
      embeddingModel: config.embeddingModel,
      embeddingRevision: config.embeddingRevision,
      classifierEnabled: config.classifierEnabled,
      classifierModel: config.classifierModel,
      classifierRevision: config.classifierRevision,
      classifierLabels: config.classifierLabels,
      maxTextTokens: config.maxTextTokens,
      allowRemoteModels: config.allowRemoteModels,
      cacheDir: options.cacheDir,
    }
  }

  function ensureWorker() {
    if (worker !== undefined) return worker
    worker = new WorkerCtor(workerUrl, { workerData: workerData() })
    worker.on('message', (message) => {
      if (message === null || typeof message !== 'object' || typeof message.id !== 'number') return
      const entry = pending.get(message.id)
      if (entry === undefined) return
      pending.delete(message.id)
      if (message.ok !== true) {
        entry.reject(new Error(typeof message.error === 'string' ? message.error : 'inference failed'))
        return
      }
      entry.resolve(message)
    })
    worker.on('error', (error) => {
      failWorker(error)
    })
    worker.on('exit', () => {
      if (disposed) return
      failWorker(new Error('inference worker exited'))
    })
    return worker
  }

  function failWorker(error) {
    ready = false
    readyPromise = undefined
    lastError = error instanceof Error ? error.message : String(error)
    const entries = Array.from(pending.values())
    pending = new Map()
    for (const entry of entries) entry.reject(error)
    const dead = worker
    worker = undefined
    if (dead !== undefined) {
      try {
        void dead.terminate()
      } catch (failure) {}
    }
    if (!disposed) {
      onError(error)
      scheduleRetry()
    }
  }

  function request(type, payload, timeoutMs, signal) {
    const current = ensureWorker()
    const id = nextId++
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (fn) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
        pending.delete(id)
        fn()
      }
      const timer = setTimeout(() => {
        finish(() => reject(new Error('inference timed out')))
        restart()
      }, Math.max(1, timeoutMs))
      const onAbort = () => {
        finish(() => reject(abortError()))
        restart()
      }
      if (signal !== undefined) {
        if (signal.aborted) {
          finish(() => reject(abortError()))
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
      pending.set(id, {
        resolve: (value) => finish(() => resolve(value)),
        reject: (error) => finish(() => reject(error)),
      })
      try {
        current.postMessage({ id, type, ...payload })
      } catch (error) {
        finish(() => reject(error))
      }
    })
  }

  function restart() {
    ready = false
    readyPromise = undefined
    const dead = worker
    worker = undefined
    const entries = Array.from(pending.values())
    pending = new Map()
    for (const entry of entries) entry.reject(new Error('inference worker restarted'))
    if (dead !== undefined) {
      try {
        void dead.terminate()
      } catch (error) {}
    }
    scheduleRetry()
  }

  async function warmup() {
    if (disposed) throw new Error('inference client disposed')
    if (ready) return
    if (readyPromise !== undefined) return readyPromise
    readyPromise = (async () => {
      await request('warmup', {}, warmupTimeoutMs)
      ready = true
      lastError = undefined
      retryDelayMs = 5000
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer)
        retryTimer = undefined
      }
    })()
    readyPromise.catch((error) => {
      readyPromise = undefined
      lastError = error instanceof Error ? error.message : String(error)
      if (!disposed) {
        onError(error)
        scheduleRetry()
      }
    })
    return readyPromise
  }

  async function evaluate(command, description, signal) {
    if (disposed) throw new Error('inference client disposed')
    if (!ready) {
      void warmup().catch(() => {})
      throw new Error('inference models are not ready')
    }
    const job = tail.then(async () => request('evaluate', {
      command,
      description: description ?? undefined,
      classify: config.classifierEnabled === true,
    }, config.modelTimeoutMs, signal))
    tail = job.then(() => undefined, () => undefined)
    return job
  }

  function start() {
    if (disposed) return
    warmup().catch(() => {})
  }

  function dispose() {
    disposed = true
    ready = false
    readyPromise = undefined
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
    for (const entry of Array.from(pending.values())) entry.reject(new Error('inference client disposed'))
    pending = new Map()
    const dead = worker
    worker = undefined
    if (dead !== undefined) {
      try {
        void dead.terminate()
      } catch (error) {}
    }
  }

  return {
    start,
    evaluate,
    warmup,
    dispose,
    get ready() { return ready },
    get lastError() { return lastError },
  }
}
