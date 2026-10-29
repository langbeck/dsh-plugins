/**
 * In-process inference worker.
 *
 * Runs Transformers.js ONNX inference off the DSH Host event loop. The parent
 * owns deadlines and worker restarts; this file only loads models and evaluates
 * one request at a time.
 */

import { parentPort, workerData } from 'node:worker_threads'
import { env, pipeline } from '@huggingface/transformers'

const settings = workerData ?? {}
let embeddingPipeline
let classifierPipeline
let loading

function configure() {
  env.allowRemoteModels = settings.allowRemoteModels !== false
  env.allowLocalModels = true
  if (typeof settings.cacheDir === 'string' && settings.cacheDir !== '') env.cacheDir = settings.cacheDir
}

async function load() {
  if (loading !== undefined) return loading
  configure()
  loading = (async () => {
    if (settings.embeddingEnabled !== false) {
      embeddingPipeline = await pipeline('feature-extraction', settings.embeddingModel, {
        device: 'cpu',
        dtype: 'q8',
        revision: settings.embeddingRevision,
      })
    }
    if (settings.classifierEnabled === true) {
      if (typeof settings.classifierModel !== 'string' || settings.classifierModel === '') {
        throw new Error('classifier model is not configured')
      }
      if (typeof settings.classifierRevision !== 'string' || settings.classifierRevision === '') {
        throw new Error('classifier revision is not configured')
      }
      classifierPipeline = await pipeline('text-classification', settings.classifierModel, {
        device: 'cpu',
        dtype: 'q8',
        revision: settings.classifierRevision,
      })
    }
    return true
  })()
  return loading
}

function tensorData(output) {
  if (output === null || output === undefined) return undefined
  if (output.data !== null && output.data !== undefined) return Array.from(output.data)
  if (Array.isArray(output)) return output
  return undefined
}

async function embed(text) {
  if (text === null || text === undefined || text === '') return undefined
  const output = await embeddingPipeline(text, {
    pooling: 'mean',
    normalize: true,
    truncation: true,
    max_length: settings.maxTextTokens,
  })
  return tensorData(output)
}

async function classify(text) {
  if (classifierPipeline === null || classifierPipeline === undefined) return undefined
  const output = await classifierPipeline(text, {
    truncation: true,
    max_length: settings.maxTextTokens,
  })
  const rows = Array.isArray(output) ? output : [output]
  const wanted = new Set((settings.classifierLabels ?? []).map((label) => String(label).toUpperCase()))
  let found
  for (const row of rows) {
    if (row === null || row === undefined) continue
    const label = String(row.label ?? '').toUpperCase()
    if (!wanted.has(label)) continue
    const score = Number(row.score)
    if (!Number.isFinite(score)) continue
    found = Math.max(found ?? 0, Math.min(1, Math.max(0, score)))
  }
  if (found === undefined) throw new Error('classifier returned no configured hostile label')
  return found
}

async function evaluate(message) {
  await load()
  const command = typeof message.command === 'string' ? message.command : ''
  const description = typeof message.description === 'string' && message.description !== '' ? message.description : undefined
  const [commandEmbedding, descriptionEmbedding, maliceScore] = await Promise.all([
    settings.embeddingEnabled !== false ? embed(command) : Promise.resolve(undefined),
    settings.embeddingEnabled !== false && description !== undefined ? embed(description) : Promise.resolve(undefined),
    settings.classifierEnabled === true ? classify(command) : Promise.resolve(undefined),
  ])
  return { commandEmbedding, descriptionEmbedding, maliceScore }
}

if (parentPort !== null) {
  parentPort.on('message', async (message) => {
    if (message === null || typeof message !== 'object' || typeof message.id !== 'number') return
    if (message.type === 'warmup') {
      try {
        await load()
        parentPort.postMessage({ id: message.id, ok: true, warmed: true })
      } catch (error) {
        parentPort.postMessage({
          id: message.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }
    try {
      const value = await evaluate(message)
      parentPort.postMessage({ id: message.id, ok: true, ...value })
    } catch (error) {
      parentPort.postMessage({
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
