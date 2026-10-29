/**
 * Balance selftest.
 *
 * Pure helpers are imported directly. The Client components are exercised by
 * executing the generated bundle in a vm with a fake React surface, then
 * applying it to a fake Client context and rendering the slot registrations.
 *
 *   node selftest.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { DEFAULT_CONFIG } from './src/client/constants.js'
import { normalizeConfig } from './src/client/lib/config.js'
import {
  formatAmount,
  formatUsd,
  orderWalletList,
  sumWallets,
  summaryText,
  visibleWallets,
  walletText,
} from './src/client/lib/money.js'
import { compactTimeLabel, formatUpdatedAt, relativeTimeParts } from './src/client/lib/time.js'
import * as host from './src/index.js'
import { createPricing, overrideMatches, parsePricing, resolvePrice } from './src/host/pricing.js'
import { foldUsage, priceSettlements, readSessionCost, usageBuckets } from './src/host/session-cost.js'

const here = dirname(fileURLToPath(import.meta.url))

let checks = 0
let failed = 0
function check(ok, label) {
  checks += 1
  if (ok) {
    console.log('ok   ' + label)
  } else {
    failed += 1
    console.error('FAIL ' + label)
  }
}
function equal(actual, expected, label) {
  check(Object.is(actual, expected), label + ' (got ' + JSON.stringify(actual) + ')')
}

// ---------------------------------------------------------------------------
// Pure Client helpers
// ---------------------------------------------------------------------------

equal(sumWallets([[{ currency: 'USD', balance: '0.00' }], [{ currency: 'CNY', balance: '2.55' }]]).length, 2, 'sumWallets keeps one entry per currency')

const summed = sumWallets([
  [{ currency: 'USD', balance: '1.20' }, { currency: 'CNY', balance: '2.00' }],
  [{ currency: 'USD', balance: '0.30' }, { currency: 'CNY', balance: '0.55' }],
])
equal(summed[0].currency, 'USD', 'sumWallets orders USD first')
equal(summed[0].amount, 1.5, 'sumWallets adds the granted USD wallet to the topped-up one')
equal(summed[1].currency, 'CNY', 'sumWallets places CNY second')
equal(summed[1].amount, 2.55, 'sumWallets adds the granted CNY wallet to the topped-up one')
equal(sumWallets([[{ currency: 'USD', balance: '1' }], [{ currency: 'USD', balance: '2' }]]).length, 1, 'sumWallets merges the same currency across wallet lists')

const cleaned = sumWallets([[
  { currency: 'USD', balance: 'not-a-number' },
  null,
  { currency: '', balance: '1.00' },
  { currency: 'EUR', balance: '1.10' },
]])
equal(cleaned.length, 1, 'sumWallets drops malformed wallets')
equal(cleaned[0].currency, 'EUR', 'sumWallets keeps an unknown but valid currency')
equal(cleaned[0].amount, 1.1, 'sumWallets reads the unknown currency amount')

equal(
  orderWalletList([{ currency: 'EUR', amount: 3 }, { currency: 'CNY', amount: 2 }, { currency: 'USD', amount: 1 }])
    .map((wallet) => wallet.currency)
    .join(','),
  'USD,CNY,EUR',
  'orderWalletList puts USD, CNY, then others',
)

equal(normalizeConfig(undefined).refreshSeconds, 60, 'normalizeConfig defaults the refresh interval')
equal(normalizeConfig(undefined).showZeroBalances, true, 'normalizeConfig defaults showZeroBalances')
equal(normalizeConfig(undefined).showCurrencyName, true, 'normalizeConfig defaults the currency codes')
equal(normalizeConfig(undefined).pricingRefreshSeconds, 3600, 'normalizeConfig defaults the pricing interval')
equal(normalizeConfig({ refreshSeconds: -5 }).refreshSeconds, 0, 'normalizeConfig clamps a negative interval')
equal(normalizeConfig({ refreshSeconds: 99999 }).refreshSeconds, 3600, 'normalizeConfig clamps a huge interval')
equal(normalizeConfig({ refreshSeconds: 12.6 }).refreshSeconds, 13, 'normalizeConfig rounds a fractional interval')
equal(normalizeConfig({ refreshSeconds: 'x' }).refreshSeconds, 60, 'normalizeConfig falls back on a non-numeric interval')
equal(normalizeConfig({ showZeroBalances: false, showCurrencyName: false }).showZeroBalances, false, 'normalizeConfig keeps an explicit false')
equal(normalizeConfig({ pricingRefreshSeconds: 10 }).pricingRefreshSeconds, 60, 'normalizeConfig clamps the pricing interval')

const wallets = [{ currency: 'USD', amount: 0 }, { currency: 'CNY', amount: 2.55 }]
equal(visibleWallets(wallets, normalizeConfig({ showZeroBalances: false })).length, 1, 'visibleWallets hides a zero balance when asked')
equal(visibleWallets(wallets, normalizeConfig({ showZeroBalances: true })).length, 2, 'visibleWallets keeps a zero balance by default')

equal(formatAmount(0), '0.00', 'formatAmount renders zero with two decimals')
equal(formatAmount(2.55), '2.55', 'formatAmount renders cents')
equal(formatAmount(0.001), '<0.01', 'formatAmount shows positive sub-cent values as <0.01')
equal(walletText({ currency: 'USD', amount: 2.55 }, true), '$2.55 USD', 'walletText shows symbol, amount, and code')
equal(walletText({ currency: 'USD', amount: 2.55 }, false), '$2.55', 'walletText can omit the code')
equal(walletText({ currency: 'EUR', amount: 2.55 }, true), '2.55 EUR', 'walletText uses the code for an unknown currency')
equal(formatUsd(0), '$0.00', 'formatUsd renders zero')
equal(formatUsd(0.0032), '$0.0032', 'formatUsd renders sub-cent estimates with four decimals')
equal(formatUsd(0.5), '$0.50', 'formatUsd renders ordinary cents')

equal(
  summaryText([{ currency: 'USD', amount: 0 }, { currency: 'CNY', amount: 2.55 }], normalizeConfig({})),
  '$0.00 USD + ¥2.55 CNY',
  'summaryText matches the reference layout',
)

const referenceNow = 1_000_000_000_000
const labelOf = (key, params) => params === undefined ? key : key + ':' + params.n
equal(relativeTimeParts(referenceNow, referenceNow).unit, 'now', 'relativeTimeParts buckets a fresh read as now')
equal(relativeTimeParts(referenceNow - 125_000, referenceNow).unit, 'minutes', 'relativeTimeParts buckets minutes')
equal(relativeTimeParts(referenceNow - 125_000, referenceNow).n, 2, 'relativeTimeParts floors whole minutes')
equal(relativeTimeParts(referenceNow - 2 * 3_600_000, referenceNow).unit, 'hours', 'relativeTimeParts buckets hours')
equal(relativeTimeParts(referenceNow - 3 * 86_400_000, referenceNow).n, 3, 'relativeTimeParts floors whole days')
equal(compactTimeLabel({ unit: 'now', n: 0 }, labelOf), 'time.now', 'compactTimeLabel localizes now')
equal(compactTimeLabel({ unit: 'minutes', n: 8 }, labelOf), 'time.minutes:8', 'compactTimeLabel passes the count')
check(typeof formatUpdatedAt(referenceNow) === 'string' && formatUpdatedAt(referenceNow).length > 0, 'formatUpdatedAt renders a locale datetime for the tooltip')
equal(formatUpdatedAt(undefined), undefined, 'formatUpdatedAt ignores an absent timestamp')

// ---------------------------------------------------------------------------
// Host pricing
// ---------------------------------------------------------------------------

const pricingBody = {
  data: [
    {
      id: 'deepseek/deepseek-v4.1-flash-1017',
      name: 'DeepSeek: DeepSeek V4.1 Flash 1017',
      pricing: {
        prompt: '0.00000015',
        completion: '0.0000006',
        input_cache_read: '0.000000003',
        overrides: [{
          utc_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          utc_start: 100,
          utc_end: 400,
          prompt: '0.0000003',
          completion: '0.0000012',
          input_cache_read: '0.000000006',
        }],
      },
    },
    {
      id: '~deepseek/deepseek-flash-latest',
      name: 'DeepSeek: DeepSeek Flash Latest',
      alias_target: { slug: 'deepseek/deepseek-v4.1-flash-1017' },
      pricing: { prompt: '0.0000000115', completion: '0.0000018' },
    },
    {
      id: 'deepseek/deepseek-v4.1-flash',
      name: 'DeepSeek: DeepSeek V4.1 Flash',
      pricing: { prompt: '0.00000014', completion: '0.00000042', input_cache_read: '0.0000000042' },
    },
    { id: 'openai/gpt-4', pricing: { prompt: '0.00003', completion: '0.00006' } },
  ],
}
const parsedPricing = parsePricing(pricingBody)
equal(parsedPricing.models.size, 2, 'parsePricing keeps only concrete deepseek/ rows')
equal(parsedPricing.aliases.size, 1, 'parsePricing indexes the deepseek latest alias')
equal(parsedPricing.aliases.get('~deepseek/deepseek-flash-latest').target, 'deepseek/deepseek-v4.1-flash-1017', 'alias resolves to the concrete versioned row')
const targetPricing = parsedPricing.models.get('deepseek/deepseek-v4.1-flash-1017')

const mondayPeak = Date.UTC(2026, 9, 26, 2, 0, 0)
const mondayOffPeak = Date.UTC(2026, 9, 26, 5, 0, 0)
const sundayNight = Date.UTC(2026, 9, 25, 2, 0, 0)
const mondayBoundary = Date.UTC(2026, 9, 26, 4, 0, 0)
equal(resolvePrice(targetPricing.pricing, mondayPeak).prompt, 0.0000003, 'peak override applies on a weekday inside the window')
equal(resolvePrice(targetPricing.pricing, mondayOffPeak).prompt, 0.00000015, 'base price applies between peak windows')
equal(resolvePrice(targetPricing.pricing, sundayNight).prompt, 0.00000015, 'base price applies on Sunday')
equal(resolvePrice(targetPricing.pricing, mondayBoundary).prompt, 0.00000015, 'the peak window end is exclusive')
equal(resolvePrice(targetPricing.pricing, mondayPeak).cacheRead, 0.000000006, 'cache-read override applies at peak')
check(overrideMatches(targetPricing.pricing.overrides[0], new Date(mondayPeak)), 'overrideMatches accepts a matching weekday window')

const folded = foldUsage([
  { type: 'request/header', time: 1, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: 1000, seq: 1, data: { turn: 1, step: 1 } },
  { type: 'assistant/message', time: 2000, seq: 2, data: { turn: 1, step: 1, usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 3000 } } },
  { type: 'llm/retry-started', time: 2100, seq: 3, data: { turn: 1, step: 1 } },
  { type: 'assistant/message', time: 2200, seq: 4, data: { turn: 1, step: 1, usage: { inputTokens: 1100, outputTokens: 210, cacheReadTokens: 3200 } } },
])
equal(folded.size, 1, 'foldUsage keeps one settlement per turn/step')
const foldedOnly = folded.get('1:1')
equal(foldedOnly.provider, 'deepseek-account', 'foldUsage carries the request-header provider')
equal(foldedOnly.model, 'deepseek-flash', 'foldUsage carries the request-header model')
equal(foldedOnly.at, 1000, 'foldUsage prices at the step-start instant')
equal(foldedOnly.usage.inputTokens, 1100, 'foldUsage keeps the retried settlement')
equal(foldedOnly.usage.cacheReadTokens, 3200, 'foldUsage keeps the retried cache read count')

const attemptFold = foldUsage([
  { type: 'request/header', time: 1, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: 1000, seq: 1, data: { turn: 2, step: 1 } },
  { type: 'assistant/attempt', time: 1500, seq: 2, data: { turn: 2, step: 1, stream: [{ type: 'chunk', time: 1400, chunk: { type: 'usage', usage: { inputTokens: 5, outputTokens: 6 } } }] } },
])
equal(attemptFold.size, 1, 'foldUsage reads usage from an attempt stream')
equal(attemptFold.get('2:1').usage.inputTokens, 5, 'foldUsage keeps the attempt stream usage')

const costAtOffPeak = priceSettlements(folded, 0, (provider, model) =>
  provider === 'deepseek-account' && model === 'deepseek-flash' ? targetPricing : undefined)
const expectedOffPeak = 3200 * 0.000000003 + 1100 * 0.00000015 + 210 * 0.0000006
check(Math.abs(costAtOffPeak.totalUsd - expectedOffPeak) < 1e-12, 'priceSettlements prices cache reads, uncached input, and output')
equal(costAtOffPeak.pricedCalls, 1, 'priceSettlements counts one priced call')
equal(costAtOffPeak.byModel.length, 1, 'priceSettlements aggregates one model')
equal(costAtOffPeak.byModel[0].pricingModel, 'deepseek/deepseek-v4.1-flash-1017', 'priceSettlements names the resolved pricing row')

const peakFold = foldUsage([
  { type: 'request/header', time: 1, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: Date.UTC(2026, 9, 26, 2, 0, 0), seq: 1, data: { turn: 3, step: 1 } },
  { type: 'assistant/message', time: Date.UTC(2026, 9, 26, 2, 0, 5), seq: 2, data: { turn: 3, step: 1, usage: { inputTokens: 1100, outputTokens: 210, cacheReadTokens: 3200 } } },
])
const costAtPeak = priceSettlements(peakFold, 0, () => targetPricing)
const expectedPeak = 3200 * 0.000000006 + 1100 * 0.0000003 + 210 * 0.0000012
check(Math.abs(costAtPeak.totalUsd - expectedPeak) < 1e-12, 'priceSettlements uses the peak override at the step instant')

const inheritedCost = priceSettlements(folded, 5, () => targetPricing)
equal(inheritedCost.totalUsd, 0, 'priceSettlements ignores fork-inherited settlements')
equal(inheritedCost.pricedCalls, 0, 'priceSettlements counts no inherited call')

const unpricedCost = priceSettlements(folded, 0, () => undefined)
equal(unpricedCost.totalUsd, 0, 'priceSettlements leaves unmapped models unpriced')
equal(unpricedCost.unpricedCalls, 1, 'priceSettlements counts an unmapped call')
equal(unpricedCost.unpricedTokens, 1100 + 3200 + 210, 'priceSettlements counts unmapped tokens')
equal(usageBuckets(foldedOnly.usage).cacheRead, 3200, 'usageBuckets separates cache-read tokens')

// ---------------------------------------------------------------------------
// Host session-cost end to end
// ---------------------------------------------------------------------------

const nowOffPeak = Date.UTC(2026, 9, 25, 12, 0, 0)
const originalHostFetch = globalThis.fetch
globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: pricingBody.data }) })
const pricingService = createPricing(3600)
await pricingService.ensure()

function observationOf(sessionId, origin, events) {
  const last = events.length === 0 ? -1 : events[events.length - 1].seq
  return {
    header: { id: sessionId, origin },
    inheritedEventCount: 0,
    cursor: last,
    events,
    [Symbol.dispose]() {},
  }
}
const rootEvents = [
  { type: 'request/header', time: nowOffPeak, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: nowOffPeak, seq: 1, data: { turn: 1, step: 1 } },
  { type: 'assistant/message', time: nowOffPeak + 1000, seq: 2, data: { turn: 1, step: 1, usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 3000 } } },
]
const childEvents = [
  { type: 'request/header', time: nowOffPeak, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: nowOffPeak, seq: 1, data: { turn: 1, step: 1 } },
  { type: 'assistant/message', time: nowOffPeak + 1000, seq: 2, data: { turn: 1, step: 1, usage: { inputTokens: 500, outputTokens: 100 } } },
]
const observations = new Map([
  ['root', observationOf('root', undefined, rootEvents)],
  ['child', observationOf('child', 'subagent', childEvents)],
])
const fakeQuery = {
  async observeSession(sessionId) {
    const observation = observations.get(sessionId)
    if (observation === undefined) throw new Error('missing session ' + sessionId)
    return observation
  },
  async traceSession() {
    return { descendants: [{ session: { header: { id: 'child', origin: 'subagent' } }, descendants: [] }] }
  },
  async listSessions() {
    return [{ header: { id: 'root' } }, { header: { id: 'child', origin: 'subagent', parentSession: 'root' } }]
  },
}
const fakeHostContext = { get(name) { return name === 'sessionQuery' ? fakeQuery : undefined } }
const costResult = await readSessionCost(fakeHostContext, pricingService, new Map(), new Map(), { sessionId: 'root' }, new AbortController().signal)
const expectedRootCost = 3000 * 0.000000003 + 1000 * 0.00000015 + 200 * 0.0000006
const expectedChildCost = 500 * 0.00000015 + 100 * 0.0000006
check(Math.abs(costResult.ownUsd - expectedRootCost) < 1e-12, 'readSessionCost prices the requested Session')
check(Math.abs(costResult.subagentsUsd - expectedChildCost) < 1e-12, 'readSessionCost adds subagent children')
check(Math.abs(costResult.totalUsd - (expectedRootCost + expectedChildCost)) < 1e-12, 'readSessionCost totals Session plus subagents')
equal(costResult.agents.length, 2, 'readSessionCost reports one cost row per agent')
equal(costResult.pricing.ready, true, 'readSessionCost reports priced pricing data')
equal(costResult.unpricedCalls, 0, 'readSessionCost prices mapped DeepSeek models')
pricingService.dispose()
globalThis.fetch = originalHostFetch

// ---------------------------------------------------------------------------
// Host cost cap service, command, and pre-step guard
// ---------------------------------------------------------------------------

const originalCapFetch = globalThis.fetch
globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: pricingBody.data }) })
let commandDefinition
let preStepHandler
let routeHandler
let askAnswer = { answers: [{ id: 'cost-cap', selected: ['Cancel'] }] }
let askAnswers = null
let askCalls = 0
const provided = {}
const routes = {}
const capDisposers = []
const capSession = { id: 'root' }
const capAgent = { id: 'root', session: capSession }
const capEvents = [
  { type: 'request/header', time: nowOffPeak, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: nowOffPeak, seq: 1, data: { turn: 1, step: 1 } },
  { type: 'assistant/message', time: nowOffPeak + 1000, seq: 2, data: { turn: 1, step: 1, usage: { inputTokens: 1_000_000, outputTokens: 1000 } } },
]
const capQuery = {
  async observeSession() { return observationOf('root', undefined, capEvents) },
  async traceSession() { return { descendants: [] } },
  async listSessions() { return [{ header: { id: 'root' } }] },
}
const fakeCapContext = {
  effect(callback) {
    const dispose = callback()
    if (typeof dispose === 'function') capDisposers.push(dispose)
    return dispose
  },
  provide(name, value) {
    provided[name] = value
    return () => { delete provided[name] }
  },
  get(name) {
    if (name === 'sessionQuery') return capQuery
    if (name === 'userQuestions') {
      return {
        ask: async () => {
          askCalls += 1
          if (askAnswers !== null && askAnswers.length > 0) return askAnswers.shift()
          return askAnswer
        },
      }
    }
    return undefined
  },
  commands: {
    register(definition) {
      commandDefinition = definition
      return () => {}
    },
  },
  on(event, handler) {
    if (event === 'agent/pre-step') preStepHandler = handler
    return () => {}
  },
  connection: {
    fetch: {
      register(route) {
        routes[route.path] = route.fetch
        if (route.path === '/api/balance-session-cost') routeHandler = route.fetch
        return () => {}
      },
    },
  },
}
await host.apply(fakeCapContext, { pricingRefreshSeconds: 3600 })
check(provided.balanceCost !== undefined, 'Host provides the balanceCost service')
check(typeof commandDefinition === 'object', 'Host registers the limit command')
check(typeof preStepHandler === 'function', 'Host registers the pre-step cost guard')
const service = provided.balanceCost
const commandResult = await commandDefinition.handler({ agent: capAgent, rawInput: ' 0.01 ' })
equal(commandResult.kind, 'success', 'limit command sets a cap')
equal(await service.limitOf('root'), 0.01, 'the service exposes the cap')
const capRoute = await routeHandler({ json: async () => ({ sessionId: 'root' }), signal: new AbortController().signal })
const capValue = await capRoute.json()
equal(capValue.value.limitUsd, 0.01, 'the cost route carries the cap')
check(capValue.value.remainingUsd === 0, 'the cost route clamps remaining to zero')
const eventsAbort = new AbortController()
const eventsResponse = await routes['/api/balance-events']({
  url: 'http://localhost/api/balance-events?sessionId=root',
  signal: eventsAbort.signal,
})
const eventsReader = eventsResponse.body.getReader()
const eventDecoder = new TextDecoder()
const readyEvent = await eventsReader.read()
check(eventDecoder.decode(readyEvent.value).includes('"type":"ready"'), 'the cost event stream opens')
await commandDefinition.handler({ agent: capAgent, rawInput: '0.02' })
const limitEvent = await eventsReader.read()
check(eventDecoder.decode(limitEvent.value).includes('"type":"limit"'), 'setting a cap emits a limit event')
check(eventDecoder.decode(limitEvent.value).includes('"limitUsd":0.02'), 'the limit event carries the cap')
eventsAbort.abort()
await eventsReader.cancel().catch(() => {})
const next = async () => ({ kind: 'enter', messages: [] })
const payload = { agent: capAgent, turn: 1, step: 1, messages: [], signal: new AbortController().signal }
const cancelled = await preStepHandler(payload, next)
equal(cancelled.kind, 'reject', 'a cancelled cap prompt rejects the step')
equal(askCalls, 1, 'the cap prompt is asked once')
askAnswer = { answers: [{ id: 'cost-cap', selected: ['Allow turn'] }] }
const allowedTurn = await preStepHandler({ ...payload, step: 2 }, next)
equal(allowedTurn.kind, 'enter', 'Allow turn permits the step')
const laterStep = await preStepHandler({ ...payload, step: 3 }, next)
equal(laterStep.kind, 'enter', 'Allow turn covers the rest of the turn')
equal(askCalls, 2, 'Allow turn does not prompt again in the same turn')
askAnswers = [
  { answers: [{ id: 'cost-cap', selected: ['Increase limit'] }] },
  { answers: [{ id: 'cost-cap-amount', selected: ['$1.02'] }] },
]
const increased = await preStepHandler({ ...payload, turn: 2, step: 1 }, next)
equal(increased.kind, 'enter', 'increasing the cap allows the step')
equal(await service.limitOf('root'), 1.02, 'the increased cap is saved through the service')
const clearResult = await commandDefinition.handler({ agent: capAgent, rawInput: 'off' })
equal(clearResult.kind, 'success', 'limit command clears the cap')
equal(await service.limitOf('root'), null, 'the service clears the cap')
capDisposers.reverse().forEach((dispose) => dispose())
globalThis.fetch = originalCapFetch

// ---------------------------------------------------------------------------
// Host Config and display metadata
// ---------------------------------------------------------------------------

const defaults = host.Config({})
for (const key of Object.keys(DEFAULT_CONFIG)) {
  equal(defaults[key], DEFAULT_CONFIG[key], 'Host Config default matches the Client default for ' + key)
}
equal(host.name, 'balance', 'Host plugin row name is balance')

const en = JSON.parse(readFileSync(join(here, 'locale', 'en.json'), 'utf8'))
const zh = JSON.parse(readFileSync(join(here, 'locale', 'zh.json'), 'utf8'))
equal(en.meta.title, 'Balance', 'English display title')
check(typeof en.meta.description === 'string' && en.meta.description.length > 0, 'English display description')
equal(zh.meta.title, '余额', 'Chinese display title')

// ---------------------------------------------------------------------------
// Generated Client bundle
// ---------------------------------------------------------------------------

const bundle = readFileSync(join(here, 'lib', 'client.js'), 'utf8')
check(bundle.indexOf('@deepseek-ai/dsh-client-ui-primitives') === -1, 'bundle imports no Harness Client package')

const injectedStyles = []
const fakeHead = {
  appendChild(node) { node.parentNode = fakeHead; injectedStyles.push(node); return node },
  removeChild(node) { node.parentNode = null; return node },
}
const fakeDocument = {
  head: fakeHead,
  visibilityState: 'visible',
  createElement(tagName) {
    return { tagName, attrs: {}, textContent: '', parentNode: null, setAttribute(name, value) { this.attrs[name] = value } }
  },
}

let entry = null
const sandbox = {
  window: { __ModuleLoader__: { load(definition) { entry = definition } } },
  document: fakeDocument,
}
vm.runInNewContext(bundle, sandbox, { filename: 'lib/client.js' })
check(entry !== null, 'bundle registers a module factory')
equal(entry.id, 'dsh-plugin-balance', 'bundle id equals the package name')

/** Minimal React surface used by the bundled components. */
function fakeReact() {
  let hookStates = []
  let hookIndex = 0
  const ReactFake = {
    createElement(type, props) {
      return { type, props: { ...(props || {}) } }
    },
    useState(initial) {
      const index = hookIndex++
      if (!(index in hookStates)) hookStates[index] = typeof initial === 'function' ? initial() : initial
      return [hookStates[index], (value) => { hookStates[index] = value }]
    },
    useRef(initial) {
      const index = hookIndex++
      if (!(index in hookStates)) hookStates[index] = { current: initial }
      return hookStates[index]
    },
    useEffect() {},
    reset(render) {
      hookStates = []
      hookIndex = 0
      return render()
    },
  }
  return ReactFake
}
const ReactFake = fakeReact()
const jsxRuntime = {
  jsx(type, props) { return { type, props: { ...(props || {}) } } },
  jsxs(type, props) { return { type, props: { ...(props || {}) } } },
  Fragment: 'Fragment',
}
const plugin = entry.factory((specifier) => {
  if (specifier === 'react') return ReactFake
  if (specifier === 'react/jsx-runtime') return jsxRuntime
  throw new Error('unexpected require: ' + specifier)
})
equal(typeof plugin.apply, 'function', 'bundle exports apply')
check(Array.isArray(plugin.inject), 'bundle exports inject')
for (const service of ['slots', 'locale', 'remote', 'remote.account', 'configForms']) {
  check(plugin.inject.indexOf(service) !== -1, 'inject includes ' + service)
}

const registrations = []
const disposers = []
const form = {
  getSnapshot: () => ({
    status: 'ready',
    value: { refreshSeconds: 0, showZeroBalances: true, showCurrencyName: true, pricingRefreshSeconds: 3600 },
    revision: 1,
    writable: true,
  }),
  subscribe: () => () => {},
  mutate: async () => true,
}
const fakeClientContext = {
  effect(callback) {
    const dispose = callback()
    if (typeof dispose === 'function') disposers.push(dispose)
    return dispose
  },
  on: () => () => {},
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
    getSnapshot: () => ({ active: 'en' }),
  },
  configForms: { get: () => form },
  slots: {
    inject(key, callback) { callback() },
    register(options, component) { registrations.push({ options, component }) },
  },
  remote: {
    account: {
      getBalance: async () => ({
        ok: true,
        value: {
          status: 'ready',
          value: [{ currency: 'USD', balance: '0.00' }],
          bonusWallets: [{ currency: 'CNY', balance: '2.55' }],
        },
      }),
    },
  },
}
plugin.apply(fakeClientContext)
await new Promise((resolve) => setTimeout(resolve, 20))

check(injectedStyles.length === 1, 'apply injects one layout stylesheet')
check(injectedStyles[0].textContent.indexOf('flex-wrap: wrap') !== -1, 'layout stylesheet makes the footer actions wrap')
check(injectedStyles[0].textContent.indexOf('data-slot="sidebar.footer.action"') !== -1, 'layout rule is scoped to the footer slot')

const pillRegistration = registrations.find((registration) => registration.options.name === 'sidebar.footer.action')
const rowConfigRegistration = registrations.find((registration) => registration.options.name === 'plugins.row.config')
const itemRegistration = registrations.find((registration) => registration.options.name === 'plugins.item')
check(pillRegistration !== undefined, 'apply registers the sidebar block')
check(rowConfigRegistration !== undefined, 'apply registers the row configure page')
check(itemRegistration !== undefined, 'apply registers the plugin settings item')
equal(rowConfigRegistration.options.key, 'dsh-plugin-balance#balance', 'configure page key names the package and row')
equal(itemRegistration.options.id, 'balance', 'plugin settings item uses the plugin id')
check(typeof itemRegistration.options.label === 'function', 'plugin settings item label follows the locale')

const injected = pillRegistration.options.inject()
injected.balanceStore.set({
  status: 'ready',
  wallets: [{ currency: 'USD', amount: 0 }, { currency: 'CNY', amount: 2.55 }],
  updatedAt: Date.now(),
})
injected.configStore.set(normalizeConfig({}))
injected.costStore.set({ status: 'ready', sessionId: 's1', totalUsd: 0.0032, partial: false })

const sessionsState = {
  ids: ['s1'],
  byId: { s1: { retainedBy: { mainView: 1 } } },
  phase: 'ready',
  projectionsBySession: {},
}
function pillProps(wide) {
  return {
    ...injected,
    wide,
    useSessions: (selector) => selector(sessionsState),
    useSessionStatus: (selector) => selector(new Map()),
    t: (key, params) => params === undefined ? key : key + ':' + JSON.stringify(params),
  }
}
function walkTree(node, visit) {
  if (Array.isArray(node)) {
    node.forEach((child) => walkTree(child, visit))
    return
  }
  if (node === null || typeof node !== 'object') return
  visit(node)
  if (node.props !== undefined) walkTree(node.props.children, visit)
}
function textOf(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => textOf(child, out))
    return out
  }
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (node !== null && typeof node === 'object' && node.props !== undefined) textOf(node.props.children, out)
  return out
}

const pillTree = ReactFake.reset(() => pillRegistration.component(pillProps(true)))
const pillText = textOf(pillTree).join(' ')
check(pillText.indexOf('$0.00') !== -1, 'wide block renders the summed USD amount')
check(pillText.indexOf('USD') !== -1, 'wide block renders the USD code')
check(pillText.indexOf('+') !== -1, 'wide block separates currencies')
check(pillText.indexOf('¥2.55') !== -1, 'wide block renders the summed CNY amount')
check(pillText.indexOf('CNY') !== -1, 'wide block renders the CNY code')
check(pillText.indexOf('row.balance') !== -1, 'wide block labels the balance row')
check(pillText.indexOf('row.session') !== -1, 'wide block labels the session row')
check(pillText.indexOf('$0.0032') !== -1, 'wide block shows the estimated session cost')
check(pillText.indexOf('time.now') !== -1, 'wide block shows the compact last-update age')
check(pillText.indexOf('≥') === -1 && pillText.indexOf('≈') === -1, 'the session cost has no prefix symbol')
check(pillTree.props.style.flexDirection === 'row', 'wide block is a horizontal container')
const contentNode = Array.isArray(pillTree.props.children)
  ? pillTree.props.children.find((node) => node !== null && typeof node === 'object' && node.props !== undefined && node.props.style !== undefined && node.props.style.flexDirection === 'column')
  : undefined
check(contentNode !== undefined && contentNode.props.style.flexDirection === 'column', 'balance and session rows stack inside the block')
check(pillTree.props.style.padding === '6px 10px', 'wide block has inner padding')

let ageStyle
let ageTitle
let balanceLabelStyle
let sessionLabelStyle
let boldCurrency = false
let stylesOk = true
walkTree(pillTree, (node) => {
  if (node.props === undefined) return
  if (node.props.style !== undefined && (typeof node.props.style !== 'object' || node.props.style === null)) stylesOk = false
  if (node.props.children === 'time.now') {
    ageStyle = node.props.style
    ageTitle = node.props.title
  }
  if (node.props.children === 'row.balance') balanceLabelStyle = node.props.style
  if (node.props.children === 'row.session') sessionLabelStyle = node.props.style
  if (node.props.children === 'USD' && node.props.style !== undefined && node.props.style.fontWeight === 600) boldCurrency = true
})
check(stylesOk, 'every style prop is an object')
check(ageStyle !== undefined && ageStyle.alignSelf === 'center', 'the last-update age is vertically centered')
check(typeof ageTitle === 'string' && ageTitle.length > 0, 'the last-update age has an absolute datetime tooltip')
check(balanceLabelStyle !== undefined && balanceLabelStyle.fontSize === '11px', 'the balance label uses the larger label size')
check(sessionLabelStyle !== undefined && sessionLabelStyle.fontSize === '11px', 'the session label uses the larger label size')
check(balanceLabelStyle !== undefined && balanceLabelStyle.width === '52px', 'labels reserve a fixed column for their values')
check(sessionLabelStyle !== undefined && sessionLabelStyle.width === '52px', 'session and limit labels share the same column')
check(boldCurrency, 'the currency codes are bold')

injected.costStore.set({ status: 'ready', sessionId: 's1', totalUsd: 1.68, limitUsd: 2, remainingUsd: 0.32, partial: false })
const capTree = ReactFake.reset(() => pillRegistration.component(pillProps(true)))
const capText = textOf(capTree).join(' ')
check(capText.indexOf('row.limit') !== -1, 'wide block labels the limit row')
check(capText.indexOf('$2.00') !== -1, 'wide block shows the cap amount')
check(capText.indexOf('$0.32') !== -1, 'wide block shows the remaining amount')
let remainingNode
let limitLabelStyle
walkTree(capTree, (node) => {
  if (node.props === undefined) return
  if (typeof node.props.children === 'string' && node.props.children.indexOf('row.remaining') === 0) remainingNode = node
  if (node.props.children === 'row.limit') limitLabelStyle = node.props.style
})
check(remainingNode !== undefined && String(remainingNode.props.style.color).includes('state-success'), 'remaining budget is highlighted')
check(limitLabelStyle !== undefined && limitLabelStyle.width === '52px', 'limit label aligns with the other labels')
injected.costStore.set({ status: 'ready', sessionId: 's1', totalUsd: 2.1, limitUsd: 2, remainingUsd: 0, partial: false })
const exhaustedTree = ReactFake.reset(() => pillRegistration.component(pillProps(true)))
let exhaustedRemaining
walkTree(exhaustedTree, (node) => {
  if (node.props !== undefined && typeof node.props.children === 'string' && node.props.children.indexOf('row.remaining') === 0) exhaustedRemaining = node
})
check(exhaustedRemaining !== undefined && String(exhaustedRemaining.props.style.color).includes('state-error'), 'an exhausted budget is highlighted in red')

const narrowTree = ReactFake.reset(() => pillRegistration.component(pillProps(false)))
const narrowText = textOf(narrowTree).join(' ')
check(narrowText.indexOf('$0.00') !== -1 && narrowText.indexOf('¥2.55') !== -1, 'narrow block renders both amounts')

const settingsRegistration = registrations.find((registration) => registration.options.name === 'plugins.item')
const settingsTree = ReactFake.reset(() => settingsRegistration.component({ view: 'page', t: (key) => key, configForm: form }))
const settingsText = textOf(settingsTree).join(' ')
check(settingsText.indexOf('config.refresh') !== -1, 'settings page renders the balance refresh field')
check(settingsText.indexOf('config.pricingRefresh') !== -1, 'settings page renders the pricing refresh field')
check(settingsText.indexOf('config.save') !== -1, 'settings page renders the save action')
let settingsStylesOk = true
walkTree(settingsTree, (node) => {
  if (node.props !== undefined && node.props.style !== undefined && (typeof node.props.style !== 'object' || node.props.style === null)) settingsStylesOk = false
})
check(settingsStylesOk, 'every settings-page style prop is an object')

disposers.forEach((dispose) => dispose())
check(injectedStyles[0].parentNode === null, 'disposing the plugin removes its layout stylesheet')

console.log('\n' + checks + ' checks, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1
