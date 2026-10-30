import BalanceRow from './components/BalanceRow.jsx'
import SettingsForm from './components/SettingsForm.jsx'
import { CONFIG_KEY, COST_CHANGED_EVENT, INJECT, LAYOUT_CSS, NS, ROW_ID } from './constants.js'
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

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'balance: dictionaries')

  ctx.effect(() => {
    const commandUi = ctx.commandUi
    const remoteCommands = ctx.remote === undefined ? undefined : ctx.remote.commands
    if (commandUi === undefined || typeof commandUi.decorate !== 'function' || remoteCommands === undefined || typeof remoteCommands.execute !== 'function') {
      return undefined
    }
    const t = ctx.locale.bind(NS)
    const optionsFor = (scope, session) => {
      const snapshot = costTracker.store.getSnapshot()
      const current = snapshot.sessionId === session.sessionId
        ? (scope === 'turn' ? snapshot.turnLimitUsd : snapshot.limitUsd)
        : null
      const amount = (value) => '$' + Number(value).toFixed(2)
      const group = (type) => ({ name: type, label: t('limit.group.' + type) })
      const result = [
        {
          id: 'show',
          label: t('limit.show'),
          detail: typeof current === 'number' ? t('limit.current', { amount: amount(current) }) : t('limit.notSet'),
          group: group('current'),
        },
        { id: 'off', label: t('limit.clear'), group: group('current') },
      ]
      for (const value of [0.5, 1, 5, 10]) {
        result.push({
          id: 'add:' + value,
          label: t('limit.increase', { amount: amount(value) }),
          group: group('relative'),
        })
      }
      for (const value of [1, 5, 10, 20]) {
        result.push({
          id: 'set:' + value,
          label: t('limit.set', { amount: amount(value) }),
          group: group('absolute'),
        })
      }
      return result
    }
    const decorate = (name, scope) => commandUi.decorate({
      name,
      available: () => true,
      ui: {
        kind: 'popupSelect',
        options: async (session) => optionsFor(scope, session),
        onSelect: async (option, session) => {
          const raw = option.id === 'show'
            ? ''
            : option.id === 'off'
              ? 'off'
              : option.id.startsWith('add:')
                ? '+' + option.id.slice(4)
                : option.id.slice(4)
          const line = '/' + name + (raw === '' ? '' : ' ' + raw)
          const result = await remoteCommands.execute(session.sessionId, line, [])
          if (result !== undefined && result !== null && result.ok !== true) {
            throw new Error(result.error?.message ?? 'limit command failed')
          }
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent(COST_CHANGED_EVENT, { detail: { sessionId: session.sessionId } }))
          }
        },
      },
    })
    const disposers = [
      decorate('session-limit', 'session'),
      decorate('turn-limit', 'turn'),
    ]
    return () => {
      for (const dispose of disposers.reverse()) {
        try { dispose() } catch (error) {}
      }
    }
  }, 'balance: limit command decorations')

  ctx.effect(() => ctx.on('command/executed', (sessionId, name) => {
    if (name !== 'limit' && name !== 'session-limit' && name !== 'turn-limit') return
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(COST_CHANGED_EVENT, { detail: { sessionId } }))
    }
  }), 'balance: limit command refresh')

  const configForm = ctx.configForms.get(ROW_ID)
  const configStore = createSnapshotStore(normalizeConfig(readConfigValue(configForm)))
  const balanceStore = createSnapshotStore({ status: 'loading', wallets: [], error: undefined, updatedAt: undefined })
  const costTracker = createCostTracker()

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
