/**
 * Bundle selftest: execute the generated client bundle in a vm with a stub
 * module loader, then check the pure data pipeline (wallet summing, currency
 * ordering, formatting, config normalization) and the Host Config schema.
 *
 *   node selftest.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

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
// generated bundle
// ---------------------------------------------------------------------------

const bundle = readFileSync(join(here, 'lib', 'client.js'), 'utf8')
check(bundle.indexOf('@deepseek-ai/dsh-client-ui-primitives') === -1, 'bundle imports no Harness Client package')

let entry = null
const sandbox = {
  window: { __ModuleLoader__: { load: function (definition) { entry = definition } } },
}
vm.runInNewContext(bundle, sandbox, { filename: 'lib/client.js' })
check(entry !== null, 'bundle registers a module factory')
equal(entry.id, 'dsh-plugin-balance', 'bundle id equals the package name')

const ReactStub = { createElement: function () { return null } }
const built = entry.factory(function (specifier) {
  if (specifier === 'react') return ReactStub
  throw new Error('unexpected require: ' + specifier)
})
check(typeof built.apply === 'function', 'bundle exports apply')
check(Array.isArray(built.inject), 'bundle exports inject')
for (const service of ['slots', 'locale', 'remote', 'remote.account', 'configForms', 'connection']) {
  check(built.inject.indexOf(service) !== -1, 'inject includes ' + service)
}

// ---------------------------------------------------------------------------
// pure helpers from the source factory
// ---------------------------------------------------------------------------

const { default: createClient } = await import('./src/client.js')
const client = createClient({})
const h = client.test

equal(h.sumWallets([[{ currency: 'USD', balance: '0.00' }], [{ currency: 'CNY', balance: '2.55' }]]).length, 2, 'sumWallets keeps one entry per currency')

const summed = h.sumWallets([
  [{ currency: 'USD', balance: '1.20' }, { currency: 'CNY', balance: '2.00' }],
  [{ currency: 'USD', balance: '0.30' }, { currency: 'CNY', balance: '0.55' }],
])
equal(summed[0].currency, 'USD', 'sumWallets orders USD first')
equal(summed[0].amount, 1.5, 'sumWallets adds the granted USD wallet to the topped-up one')
equal(summed[1].currency, 'CNY', 'sumWallets places CNY second')
equal(summed[1].amount, 2.55, 'sumWallets adds the granted CNY wallet to the topped-up one')
equal(h.sumWallets([[{ currency: 'USD', balance: '1' }], [{ currency: 'USD', balance: '2' }]]).length, 1, 'sumWallets merges the same currency across wallet lists')

const cleaned = h.sumWallets([[
  { currency: 'USD', balance: 'not-a-number' },
  null,
  { currency: '', balance: '1.00' },
  { currency: 'EUR', balance: '1.10' },
]])
equal(cleaned.length, 1, 'sumWallets drops malformed wallets')
equal(cleaned[0].currency, 'EUR', 'sumWallets keeps an unknown but valid currency')
equal(cleaned[0].amount, 1.1, 'sumWallets reads the unknown currency amount')

const ordered = h.orderWalletList([
  { currency: 'EUR', amount: 3 },
  { currency: 'CNY', amount: 2 },
  { currency: 'USD', amount: 1 },
])
equal(ordered.map((wallet) => wallet.currency).join(','), 'USD,CNY,EUR', 'orderWalletList puts USD, CNY, then others')

equal(h.normalizeConfig(undefined).refreshSeconds, 60, 'normalizeConfig defaults the refresh interval')
equal(h.normalizeConfig(undefined).showZeroBalances, true, 'normalizeConfig defaults showZeroBalances')
equal(h.normalizeConfig(undefined).showCurrencyName, true, 'normalizeConfig defaults the currency codes')
equal(h.normalizeConfig({ refreshSeconds: -5 }).refreshSeconds, 0, 'normalizeConfig clamps a negative interval')
equal(h.normalizeConfig({ refreshSeconds: 99999 }).refreshSeconds, 3600, 'normalizeConfig clamps a huge interval')
equal(h.normalizeConfig({ refreshSeconds: 12.6 }).refreshSeconds, 13, 'normalizeConfig rounds a fractional interval')
equal(h.normalizeConfig({ refreshSeconds: 'x' }).refreshSeconds, 60, 'normalizeConfig falls back on a non-numeric interval')
equal(h.normalizeConfig({ showZeroBalances: false, showCurrencyName: false }).showZeroBalances, false, 'normalizeConfig keeps an explicit false')
equal(h.normalizeConfig({ showZeroBalances: false, showCurrencyName: false }).showCurrencyName, false, 'normalizeConfig keeps an explicit currency-code false')

const wallets = [{ currency: 'USD', amount: 0 }, { currency: 'CNY', amount: 2.55 }]
equal(h.visibleWallets(wallets, h.normalizeConfig({ showZeroBalances: false })).length, 1, 'visibleWallets hides a zero balance when asked')
equal(h.visibleWallets(wallets, h.normalizeConfig({ showZeroBalances: true })).length, 2, 'visibleWallets keeps a zero balance by default')

equal(h.formatAmount(0), '0.00', 'formatAmount renders zero with two decimals')
equal(h.formatAmount(2.55), '2.55', 'formatAmount renders cents')
equal(h.formatAmount(0.001), '<0.01', 'formatAmount shows positive sub-cent values as <0.01')
equal(h.walletText({ currency: 'USD', amount: 2.55 }, true), '$2.55 USD', 'walletText shows symbol, amount, and code')
equal(h.walletText({ currency: 'USD', amount: 2.55 }, false), '$2.55', 'walletText can omit the code')
equal(h.walletText({ currency: 'EUR', amount: 2.55 }, true), '2.55 EUR', 'walletText uses the code for an unknown currency')
equal(h.formatUsd(0), '$0.00', 'formatUsd renders zero')
equal(h.formatUsd(0.0032), '$0.0032', 'formatUsd renders sub-cent estimates with four decimals')
equal(h.formatUsd(0.5), '$0.50', 'formatUsd renders ordinary cents')

equal(
  h.summaryText([{ currency: 'USD', amount: 0 }, { currency: 'CNY', amount: 2.55 }], h.normalizeConfig({})),
  '$0.00 USD + ¥2.55 CNY',
  'summaryText matches the reference layout',
)

const referenceNow = 1_000_000_000_000
const labelOf = (key, params) => params === undefined ? key : key + ':' + params.n
equal(h.relativeTimeParts(referenceNow, referenceNow).unit, 'now', 'relativeTimeParts buckets a fresh read as now')
equal(h.relativeTimeParts(referenceNow - 125000, referenceNow).unit, 'minutes', 'relativeTimeParts buckets minutes')
equal(h.relativeTimeParts(referenceNow - 125000, referenceNow).n, 2, 'relativeTimeParts floors whole minutes')
equal(h.relativeTimeParts(referenceNow - 2 * 3600 * 1000, referenceNow).unit, 'hours', 'relativeTimeParts buckets hours')
equal(h.relativeTimeParts(referenceNow - 3 * 86400 * 1000, referenceNow).n, 3, 'relativeTimeParts floors whole days')
equal(h.compactTimeLabel({ unit: 'now', n: 0 }, labelOf), 'time.now', 'compactTimeLabel localizes now')
equal(h.compactTimeLabel({ unit: 'minutes', n: 8 }, labelOf), 'time.minutes:8', 'compactTimeLabel passes the count')

// ---------------------------------------------------------------------------
// Host Config schema and display metadata
// ---------------------------------------------------------------------------

const host = await import('./src/index.js')
const defaults = host.Config({})
equal(defaults.refreshSeconds, 60, 'Host Config defaults refreshSeconds to 60')
equal(defaults.showZeroBalances, true, 'Host Config defaults showZeroBalances')
equal(defaults.showCurrencyName, true, 'Host Config defaults showCurrencyName')
for (const key of Object.keys(h.DEFAULT_CONFIG)) {
  equal(defaults[key], h.DEFAULT_CONFIG[key], 'Host Config default matches the Client default for ' + key)
}
equal(defaults.pricingRefreshSeconds, 3600, 'Host Config defaults pricingRefreshSeconds to 3600')
equal(host.name, 'balance', 'Host plugin row name is balance')

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
const parsedPricing = host.test.parsePricing(pricingBody)
equal(parsedPricing.models.size, 2, 'parsePricing keeps only concrete deepseek/ rows')
equal(parsedPricing.aliases.size, 1, 'parsePricing indexes the deepseek latest alias')
equal(
  parsedPricing.aliases.get('~deepseek/deepseek-flash-latest').target,
  'deepseek/deepseek-v4.1-flash-1017',
  'alias resolves to the concrete versioned row',
)
const targetPricing = parsedPricing.models.get('deepseek/deepseek-v4.1-flash-1017')

const mondayPeak = Date.UTC(2026, 9, 26, 2, 0, 0)
const mondayOffPeak = Date.UTC(2026, 9, 26, 5, 0, 0)
const sundayNight = Date.UTC(2026, 9, 25, 2, 0, 0)
const mondayBoundary = Date.UTC(2026, 9, 26, 4, 0, 0)
equal(host.test.resolvePrice(targetPricing.pricing, mondayPeak).prompt, 0.0000003, 'peak override applies on a weekday inside the window')
equal(host.test.resolvePrice(targetPricing.pricing, mondayOffPeak).prompt, 0.00000015, 'base price applies between peak windows')
equal(host.test.resolvePrice(targetPricing.pricing, sundayNight).prompt, 0.00000015, 'base price applies on Sunday')
equal(host.test.resolvePrice(targetPricing.pricing, mondayBoundary).prompt, 0.00000015, 'the peak window end is exclusive')
equal(host.test.resolvePrice(targetPricing.pricing, mondayPeak).cacheRead, 0.000000006, 'cache-read override applies at peak')

const folded = host.test.foldUsage([
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

const attemptFold = host.test.foldUsage([
  { type: 'request/header', time: 1, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: 1000, seq: 1, data: { turn: 2, step: 1 } },
  { type: 'assistant/attempt', time: 1500, seq: 2, data: { turn: 2, step: 1, stream: [{ type: 'chunk', time: 1400, chunk: { type: 'usage', usage: { inputTokens: 5, outputTokens: 6 } } }] } },
])
equal(attemptFold.size, 1, 'foldUsage reads usage from an attempt stream')
equal(attemptFold.get('2:1').usage.inputTokens, 5, 'foldUsage keeps the attempt stream usage')

const costEntry = targetPricing
const costAtOffPeak = host.test.priceSettlements(folded, 0, function (provider, model) {
  return provider === 'deepseek-account' && model === 'deepseek-flash' ? costEntry : undefined
})
const expectedOffPeak = 3200 * 0.000000003 + 1100 * 0.00000015 + 210 * 0.0000006
check(Math.abs(costAtOffPeak.totalUsd - expectedOffPeak) < 1e-12, 'priceSettlements prices cache reads, uncached input, and output')
equal(costAtOffPeak.pricedCalls, 1, 'priceSettlements counts one priced call')
equal(costAtOffPeak.byModel.length, 1, 'priceSettlements aggregates one model')
equal(costAtOffPeak.byModel[0].pricingModel, 'deepseek/deepseek-v4.1-flash-1017', 'priceSettlements names the resolved pricing row')

const peakFold = host.test.foldUsage([
  { type: 'request/header', time: 1, seq: 0, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } },
  { type: 'step/start', time: Date.UTC(2026, 9, 26, 2, 0, 0), seq: 1, data: { turn: 3, step: 1 } },
  { type: 'assistant/message', time: Date.UTC(2026, 9, 26, 2, 0, 5), seq: 2, data: { turn: 3, step: 1, usage: { inputTokens: 1100, outputTokens: 210, cacheReadTokens: 3200 } } },
])
const costAtPeak = host.test.priceSettlements(peakFold, 0, function () { return costEntry })
const expectedPeak = 3200 * 0.000000006 + 1100 * 0.0000003 + 210 * 0.0000012
check(Math.abs(costAtPeak.totalUsd - expectedPeak) < 1e-12, 'priceSettlements uses the peak override at the step instant')

const inheritedCost = host.test.priceSettlements(folded, 5, function () { return costEntry })
equal(inheritedCost.totalUsd, 0, 'priceSettlements ignores fork-inherited settlements')
equal(inheritedCost.pricedCalls, 0, 'priceSettlements counts no inherited call')

const unpricedCost = host.test.priceSettlements(folded, 0, function () { return undefined })
equal(unpricedCost.totalUsd, 0, 'priceSettlements leaves unmapped models unpriced')
equal(unpricedCost.unpricedCalls, 1, 'priceSettlements counts an unmapped call')
equal(unpricedCost.unpricedTokens, 1100 + 3200 + 210, 'priceSettlements counts unmapped tokens')

const originalHostFetch = globalThis.fetch
const nowOffPeak = Date.UTC(2026, 9, 25, 12, 0, 0)
const pricingFixture = { data: pricingBody.data }
globalThis.fetch = async () => ({ ok: true, json: async () => pricingFixture })
const pricingService = host.test.createPricing(3600)
await pricingService.ensure()

function observationOf(sessionId, origin, events) {
  const last = events.length === 0 ? -1 : events[events.length - 1].seq
  return {
    header: { id: sessionId, origin: origin },
    inheritedEventCount: 0,
    cursor: last,
    events: events,
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
const fakeContext = { get(name) { return name === 'sessionQuery' ? fakeQuery : undefined } }
const costResult = await host.test.readSessionCost(fakeContext, pricingService, new Map(), new Map(), { sessionId: 'root' }, new AbortController().signal)
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

const en = JSON.parse(readFileSync(join(here, 'locale', 'en.json'), 'utf8'))
const zh = JSON.parse(readFileSync(join(here, 'locale', 'zh.json'), 'utf8'))
equal(en.meta.title, 'Balance', 'English display title')
check(typeof en.meta.description === 'string' && en.meta.description.length > 0, 'English display description')
equal(zh.meta.title, '余额', 'Chinese display title')


// ---------------------------------------------------------------------------
// component render smoke test (fake React hooks, no browser)
// ---------------------------------------------------------------------------

/** Minimal React surface the components use, with real hook-state slots. */
function fakeReact() {
  let hookStates = []
  let hookIndex = 0
  const ReactFake = {
    createElement(type, props, ...children) {
      return { type, props: { ...(props || {}), children: children.length <= 1 ? children[0] : children } }
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

const ReactFake = fakeReact()
const renderClient = createClient({ React: ReactFake })
const registrations = []
const disposers = []
const injectedStyles = []
const fakeHead = {
  appendChild(node) { node.parentNode = fakeHead; injectedStyles.push(node); return node },
  removeChild(node) { node.parentNode = null; return node },
}
// The layout-wrapping rule is written through a real <style> element; keep the
// stub minimal so the apply-time effect is exercised outside a browser.
globalThis.document = {
  head: fakeHead,
  createElement(tagName) {
    return {
      tagName,
      attrs: {},
      textContent: '',
      parentNode: null,
      setAttribute(name, value) { this.attrs[name] = value },
    }
  },
}
const form = {
  getSnapshot: () => ({
    status: 'ready',
    value: { refreshSeconds: 60, showZeroBalances: true, showCurrencyName: true },
    revision: 3,
    writable: true,
  }),
  subscribe: () => () => {},
  mutate: async () => true,
}
const renderCtx = {
  effect(callback) {
    const dispose = callback()
    if (typeof dispose === 'function') disposers.push(dispose)
    return dispose
  },
  locale: { register: () => () => {}, bind: () => (key) => key, getSnapshot: () => ({ active: 'en' }) },
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
  connection: {},
}
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, options) => ({
  ok: true,
  json: async () => ({
    ok: true,
    value: {
      sessionId: 's1',
      totalUsd: 0.0032,
      unpricedCalls: 0,
      pricing: { ready: true, revision: 1, fetchedAt: 1 },
    },
  }),
})
renderClient.apply(renderCtx)
await new Promise((resolve) => setTimeout(resolve, 30))

const pillRegistration = registrations.find((entry) => entry.options.name === 'sidebar.footer.action')
const configRegistration = registrations.find((entry) => entry.options.name === 'plugins.row.config')
const itemRegistration = registrations.find((entry) => entry.options.name === 'plugins.item')
check(pillRegistration !== undefined, 'apply registers the sidebar pill')
check(configRegistration !== undefined, 'apply registers the row configure page')
check(itemRegistration !== undefined, 'apply registers the plugin settings item')
equal(configRegistration.options.key, 'dsh-plugin-balance#balance', 'configure page key names the package and row')
equal(itemRegistration.options.id, 'balance', 'plugin settings item uses the plugin id')
check(typeof itemRegistration.options.label === 'function', 'plugin settings item label follows the locale')

function pillProps(wide) {
  return {
    wide,
    useSessionStatus: (selector) => selector(new Map()),
    useSessions: (selector) => selector({
      ids: ['s1'],
      byId: { s1: { retainedBy: { mainView: 1 } } },
      phase: 'ready',
      projectionsBySession: {},
    }),
    t: (key, params) => params === undefined ? key : key + ':' + JSON.stringify(params),
  }
}

check(injectedStyles.length === 1, 'apply injects one layout stylesheet')
const layoutCss = injectedStyles[0].textContent
check(layoutCss.indexOf('flex-wrap: wrap') !== -1, 'layout stylesheet makes the footer actions wrap')
check(layoutCss.indexOf('data-slot="sidebar.footer.action"') !== -1, 'layout rule is scoped to the footer slot')

await renderClient.test.refreshSessionCost('s1')
const pillTree = ReactFake.reset(() => pillRegistration.component(pillProps(true)))
const pillText = textOf(pillTree).join(' ')
check(String(pillTree.props.style.flex || '').indexOf('100%') !== -1, 'wide pill requests the full row width')
check(pillTree.props.style.width === '100%', 'wide pill sets width to the container width')
check(pillTree.props.style.marginTop === '6px' && pillTree.props.style.marginBottom === '6px', 'wide pill spaces itself vertically')
check(pillTree.props.title === undefined, 'wide pill has no hover title')
check(pillText.indexOf('time.now') !== -1, 'wide pill shows the compact last-update age')
check(pillText.indexOf('$0.0032') !== -1, 'wide pill shows the estimated session cost')
check(pillText.indexOf('row.balance') !== -1, 'wide pill labels the balance row')
check(pillText.indexOf('row.session') !== -1, 'wide pill labels the session row')
check(pillText.indexOf('USD') !== -1, 'the session cost is labelled as USD')
check(pillTree.props.style.flexDirection === 'row', 'wide pill is a horizontal block')
const contentNode = Array.isArray(pillTree.props.children)
  ? pillTree.props.children.find((node) => node !== null && typeof node === 'object' && node.props !== undefined && node.props.key === 'content')
  : undefined
check(contentNode !== undefined && contentNode.props.style.flexDirection === 'column', 'balance and session rows stack inside the block')
check(pillTree.props.style.padding === '6px 10px', 'wide pill has inner padding')
let ageStyle
let balanceLabelStyle
let sessionLabelStyle
walkTree(pillTree, (node) => {
  if (node.props === undefined) return
  if (node.props.children === 'time.now') ageStyle = node.props.style
  if (node.props.children === 'row.balance') balanceLabelStyle = node.props.style
  if (node.props.children === 'row.session') sessionLabelStyle = node.props.style
})
check(ageStyle !== undefined && ageStyle.alignSelf === 'center', 'the last-update age is vertically centered')
check(balanceLabelStyle !== undefined && balanceLabelStyle.fontVariantCaps === undefined && balanceLabelStyle.fontSize === '11px', 'the balance label uses the larger label size')
check(sessionLabelStyle !== undefined && sessionLabelStyle.fontVariantCaps === undefined && sessionLabelStyle.fontSize === '11px', 'the session label uses the larger label size')
check(pillText.indexOf('≥') === -1, 'the session cost has no lower-bound glyph')
check(pillText.indexOf('≈') === -1, 'the session cost has no prefix symbol')
let boldCurrency = false
walkTree(pillTree, (node) => {
  if (node.props !== undefined && node.props.children === 'USD' && node.props.style !== undefined && node.props.style.fontWeight === 600) boldCurrency = true
})
check(boldCurrency, 'the currency codes are bold')
check(pillText.indexOf('$0.00') !== -1, 'wide pill renders the summed USD amount')
check(pillText.indexOf('USD') !== -1, 'wide pill renders the USD code')
check(pillText.indexOf('+') !== -1, 'wide pill separates currencies')
check(pillText.indexOf('¥2.55') !== -1, 'wide pill renders the summed CNY amount')
check(pillText.indexOf('CNY') !== -1, 'wide pill renders the CNY code')
let pillStylesOk = true
walkTree(pillTree, (node) => {
  if (node.props !== undefined && node.props.style !== undefined) {
    if (typeof node.props.style !== 'object' || node.props.style === null) pillStylesOk = false
  }
})
check(pillStylesOk, 'every pill style prop is an object')

const narrowTree = ReactFake.reset(() => pillRegistration.component(pillProps(false)))
const narrowText = textOf(narrowTree).join(' ')
check(narrowText.indexOf('$0.00') !== -1 && narrowText.indexOf('¥2.55') !== -1, 'narrow pill renders both amounts')

const configTree = ReactFake.reset(() => configRegistration.component({ view: 'page', t: (key) => key }))
const configText = textOf(configTree).join(' ')
check(configText.indexOf('config.refresh') !== -1, 'configure page renders the refresh field')
check(configText.indexOf('config.save') !== -1, 'configure page renders the save action')
let configStylesOk = true
walkTree(configTree, (node) => {
  if (node.props !== undefined && node.props.style !== undefined) {
    if (typeof node.props.style !== 'object' || node.props.style === null) configStylesOk = false
  }
})
check(configStylesOk, 'every configure-page style prop is an object')

disposers.forEach((dispose) => dispose())
check(injectedStyles[0].parentNode === null, 'disposing the plugin removes its layout stylesheet')
globalThis.fetch = originalFetch
delete globalThis.document

console.log('\n' + checks + ' checks, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1
