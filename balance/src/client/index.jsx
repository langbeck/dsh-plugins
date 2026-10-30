import BalanceRow from './components/BalanceRow.jsx'
import SettingsForm from './components/SettingsForm.jsx'
import { CONFIG_KEY, INJECT, LAYOUT_CSS, LIMIT_ROUTE, NS, ROW_ID } from './constants.js'
import { normalizeConfig } from './lib/config.js'
import { createCostTracker } from './lib/cost.js'
import { sumWallets } from './lib/money.js'
import { createSnapshotStore } from './lib/store.js'
import { EN, ZH } from './locale.js'

/**
 * Balance — Client half.
 *
 * Registers the full-width footer block, the bundle row's Configure page and
 * the Plugins-list settings item. The Host owns pricing and the session-cost
 * fold; this half only polls the account balance and asks the Host for the
 * current Session's estimate.
 */
export default function createClient() {
  return { apply, inject: INJECT }
}

function WalletIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path d="M4 8h16" />
      <path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z" />
    </svg>
  )
}

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'balance: dictionaries')


  const configForm = ctx.configForms.get(ROW_ID)
  const configStore = createSnapshotStore(normalizeConfig(readConfigValue(configForm)))
  const balanceStore = createSnapshotStore({ status: 'loading', wallets: [], error: undefined, updatedAt: undefined })
  const costTracker = createCostTracker()
  const t = ctx.locale.bind(NS)
  const claimFor = (scope, sessionId) => {
    const name = scope === 'turn' ? 'turn-budget' : 'session-budget'
    const token = '/' + name + ' '
    return {
      name,
      token,
      hint: t('budget.claimHint'),
      submit: async (args) => {
        let result
        try {
          const response = await fetch(LIMIT_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, scope, input: typeof args === 'string' ? args.trim() : '' }),
          })
          result = await response.json()
        } catch (error) {
          return { kind: 'error', text: t('budget.failed') }
        }
        if (result === null || result === undefined || result.ok !== true) {
          return { kind: 'error', text: result?.error?.message ?? t('budget.failed') }
        }
        costTracker.refresh(sessionId)
        return { kind: 'success', text: result.value.text ?? t('budget.saved') }
      },
    }
  }
  const sourceItems = () => [
    {
      name: 'session-budget',
      label: t('budget.sessionItem'),
      description: t('budget.sessionDescription'),
      icon: WalletIcon,
      section: t('budget.section'),
      value: 'session',
    },
    {
      name: 'turn-budget',
      label: t('budget.turnItem'),
      description: t('budget.turnDescription'),
      icon: WalletIcon,
      section: t('budget.section'),
      value: 'turn',
    },
  ]
  ctx.effect(() => {
    const inputTriggers = ctx.inputTriggers
    if (inputTriggers === undefined || typeof inputTriggers.registerSource !== 'function') return undefined
    const scopeOf = (name) => name === 'turn-budget' ? 'turn' : 'session'
    return inputTriggers.registerSource({
      trigger: '/',
      name: 'budget',
      order: 1,
      showGroupTitle: false,
      candidates: (_session, { query }) => {
        const needle = query.trim().toLowerCase()
        if (needle === '') return sourceItems()
        return sourceItems().filter((item) => item.label.toLowerCase().includes(needle) || item.name.includes(needle))
      },
      onPick: (pick) => ({ claim: claimFor(scopeOf(pick.candidate.name), pick.session.sessionId) }),
      matchEnter: (session, line) => {
        const match = /^\/(session-budget|turn-budget)(?:\s|$)/.exec(line.trim())
        if (match === null) return undefined
        return { claim: claimFor(scopeOf(match[1]), session.sessionId) }
      },
      matchClaim: (session, token) => {
        const match = /^\/(session-budget|turn-budget)$/.exec(token.trim())
        if (match === null) return undefined
        return claimFor(scopeOf(match[1]), session.sessionId)
      },
    })
  }, 'balance: budget input source')


  let timer = null
  let refreshing = false
  let disposed = false

  ctx.effect(() => {
    if (typeof document === 'undefined' || document.head === undefined) return
    const tag = document.createElement('style')
    tag.setAttribute('data-plugin', 'dsh-plugin-balance')
    tag.setAttribute('data-plugin-css', 'balance/layout')
    tag.textContent = LAYOUT_CSS
    document.head.appendChild(tag)
    return () => {
      if (tag.parentNode !== null && tag.parentNode !== undefined) tag.parentNode.removeChild(tag)
    }
  }, 'balance: layout')

  function readConfigValue(form) {
    try {
      const snapshot = form.getSnapshot()
      return snapshot === null || snapshot === undefined ? undefined : snapshot.value
    } catch (error) {
      return undefined
    }
  }

  function syncConfig() {
    const next = normalizeConfig(readConfigValue(configForm))
    const previous = configStore.getSnapshot()
    configStore.set(next)
    if (previous.refreshSeconds !== next.refreshSeconds) schedule()
  }

  function accountNamespace() {
    try {
      const remote = ctx.remote
      if (remote === null || remote === undefined) return undefined
      const account = remote.account
      return account === null || account === undefined ? undefined : account
    } catch (error) {
      return undefined
    }
  }

  function clientMetadata() {
    let version = 'unknown'
    try {
      const boot = globalThis.__DSH_BOOT__
      if (boot !== null && boot !== undefined && boot.release !== null && boot.release !== undefined) {
        if (typeof boot.release.version === 'string' && boot.release.version !== '') version = boot.release.version
      }
    } catch (error) {}
    return {
      version,
      locale: ctx.locale.getSnapshot().active,
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
  }

  function failRead() {
    const previous = balanceStore.getSnapshot()
    if (previous.status === 'ready') {
      balanceStore.set({ status: 'ready', wallets: previous.wallets, error: 'request-failed', updatedAt: previous.updatedAt })
    } else {
      balanceStore.set({ status: 'error', wallets: [], error: 'request-failed', updatedAt: previous.updatedAt })
    }
  }

  function refreshBalance() {
    if (refreshing || disposed) return
    const account = accountNamespace()
    if (account === undefined) {
      balanceStore.set({ status: 'unavailable', wallets: [], error: undefined, updatedAt: undefined })
      return
    }
    refreshing = true
    Promise.resolve()
      .then(() => account.getBalance(clientMetadata()))
      .then((result) => {
        if (disposed) return
        if (result === null || result === undefined || result.ok !== true) {
          failRead()
          return
        }
        const value = result.value
        if (value === null || value === undefined) {
          balanceStore.set({ status: 'signed-out', wallets: [], error: undefined, updatedAt: undefined })
          return
        }
        if (value.status !== 'ready') {
          failRead()
          return
        }
        balanceStore.set({ status: 'ready', wallets: sumWallets([value.value, value.bonusWallets]), error: undefined, updatedAt: Date.now() })
      })
      .catch(() => {
        if (!disposed) failRead()
      })
      .then(() => {
        refreshing = false
      })
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule() {
    clearTimer()
    const seconds = configStore.getSnapshot().refreshSeconds
    if (!(seconds > 0)) return
    timer = setTimeout(tick, seconds * 1000)
  }

  function tick() {
    timer = null
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      schedule()
      return
    }
    refreshBalance()
    schedule()
  }

  ctx.effect(() => {
    syncConfig()
    return configForm.subscribe(syncConfig)
  }, 'balance: settings')

  ctx.effect(() => {
    refreshBalance()
    schedule()
    return clearTimer
  }, 'balance: polling')

  ctx.effect(() => {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') {
        refreshBalance()
        schedule()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, 'balance: visibility')

  ctx.effect(() => () => {
    disposed = true
    clearTimer()
    costTracker.dispose()
  }, 'balance: disposal')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: ROW_ID,
    order: 5,
    locale: NS,
    inject: () => ({
      balanceStore,
      configStore,
      costStore: costTracker.store,
      refreshBalance,
      refreshCost: costTracker.refresh,
    }),
  }, BalanceRow))

  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    key: CONFIG_KEY,
    locale: NS,
    inject: () => ({ configForm }),
  }, SettingsForm))
}
