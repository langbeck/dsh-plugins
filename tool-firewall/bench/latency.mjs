/**
 * Optional real-model latency benchmark.
 *
 * Run after dependencies and models are available:
 *   npm run bench
 */

import { normalizeConfig } from '../src/config.js'
import { createInferenceClient } from '../src/host/inference-client.js'

const config = normalizeConfig({
  embeddingEnabled: true,
  classifierEnabled: false,
  modelTimeoutMs: 2000,
})
const client = createInferenceClient(config, {})
const started = performance.now()
try {
  await client.warmup()
  const warm = performance.now()
  const samples = []
  for (let index = 0; index < 20; index += 1) {
    const begin = performance.now()
    await client.evaluate('git status', 'Show working tree status', new AbortController().signal)
    samples.push(performance.now() - begin)
  }
  samples.sort((left, right) => left - right)
  const p50 = samples[Math.floor(samples.length * 0.5)]
  const p95 = samples[Math.floor(samples.length * 0.95)]
  console.log('warmup: ' + (warm - started).toFixed(1) + 'ms')
  console.log('evaluate p50: ' + p50.toFixed(1) + 'ms')
  console.log('evaluate p95: ' + p95.toFixed(1) + 'ms')
} finally {
  client.dispose()
}
