import FirewallSettingsDialog from './components/FirewallSettingsDialog.jsx'
import FirewallStats from './components/FirewallStats.jsx'
import SettingsForm from './components/SettingsForm.jsx'
import { CONFIG_KEY, INJECT, LAYOUT_CSS, NS, OVERLAY_ID, ROW_ID, STATS_ID, STATS_ROUTE } from './constants.js'
import { normalizeConfig } from './lib/config.js'
import { createValueStore } from './lib/store.js'
import { EN, ZH } from './locale.js'

/**
 * Tool Firewall — Client half.
 *
 * Registers the Plugin Manager configure page, a sidebar stats card, and the
 * stats card's settings dialog. All persistence goes through the Host-owned
 * Config form.
 */
export default function createClient() {
  return { apply, inject: INJECT }
}

function readConfigValue(form) {
  try {
    const snapshot = form.getSnapshot()
    return snapshot === null || snapshot === undefined ? undefined : snapshot.value
  } catch (error) {
    return undefined
  }
}

function modelEntry(labelKey, configured, model) {
  if (configured !== true) return { labelKey, valueKey: 'stats.disabled', tone: 'muted' }
  if (model?.state === 'error') {
    return {
      labelKey,
      valueKey: 'stats.error',
      tone: 'error',
      title: typeof model.error === 'string' ? model.error : undefined,
    }
  }
  if (model?.state === 'ready') return { labelKey, valueKey: 'stats.ready' }
  return { labelKey, valueKey: 'stats.loading', tone: 'muted' }
}

function buildStats(value, counters = { blocked: 0, total: 0, outputsBlocked: 0, outputsScanned: 0 }) {
  const config = normalizeConfig(value)
  const models = counters.models ?? {}
  return [
    { labelKey: 'stats.firewall', valueKey: config.enabled ? 'stats.on' : 'stats.off', tone: config.enabled ? undefined : 'off' },
    { labelKey: 'stats.embedding', valueKey: config.embeddingEnabled ? 'stats.on' : 'stats.off', tone: config.embeddingEnabled ? undefined : 'off' },
    { labelKey: 'stats.classifier', valueKey: config.classifierEnabled ? 'stats.on' : 'stats.off', tone: config.classifierEnabled ? undefined : 'off' },
    modelEntry('stats.embeddingModel', config.embeddingEnabled, models.embedding),
    modelEntry('stats.classifierModel', config.classifierEnabled, models.classifier),
    modelEntry('stats.outputGuard', config.outputGuardEnabled, models.outputGuard),
    { labelKey: 'stats.mode', valueKey: config.semanticFailure === 'closed' ? 'stats.closed' : 'stats.open' },
    { labelKey: 'stats.blocks', value: String(counters.blocked ?? 0) + ' / ' + String(counters.total ?? 0) },
    { labelKey: 'stats.outputBlocks', value: String(counters.outputsBlocked ?? 0) + ' / ' + String(counters.outputsScanned ?? 0) },
  ]
}

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'tool-firewall: dictionaries')
  const configForm = ctx.configForms.get(ROW_ID)
  const remoteStats = { blocked: 0, total: 0, outputsBlocked: 0, outputsScanned: 0, models: undefined }
  const statsStore = createValueStore(buildStats(readConfigValue(configForm), remoteStats))
  const uiStore = createValueStore({ open: false })
  const open = () => uiStore.set({ open: true })
  const close = () => uiStore.set({ open: false })

  const refreshStats = () => statsStore.set(buildStats(readConfigValue(configForm), remoteStats))

  ctx.effect(() => {
    refreshStats()
    return configForm.subscribe(refreshStats)
  }, 'tool-firewall: stats')

  ctx.effect(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return undefined
    let disposed = false
    const tick = () => {
      if (disposed) return
      Promise.resolve()
        .then(() => fetch(STATS_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }))
        .then((response) => response.ok ? response.json() : undefined)
        .then((result) => {
          if (disposed || result === undefined || result.ok !== true) return
          const value = result.value
          if (value === null || value === undefined) return
          remoteStats.blocked = Number.isFinite(value.blocked) ? value.blocked : remoteStats.blocked
          remoteStats.total = Number.isFinite(value.total) ? value.total : remoteStats.total
          remoteStats.outputsBlocked = Number.isFinite(value.outputsBlocked) ? value.outputsBlocked : remoteStats.outputsBlocked
          remoteStats.outputsScanned = Number.isFinite(value.outputsScanned) ? value.outputsScanned : remoteStats.outputsScanned
          remoteStats.models = value.models ?? remoteStats.models
          refreshStats()
        })
        .catch(() => {})
    }
    tick()
    const timer = setInterval(tick, 5000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, 'tool-firewall: remote stats')

  ctx.effect(() => {
    if (typeof document === 'undefined' || document.head === undefined) return undefined
    const tag = document.createElement('style')
    tag.setAttribute('data-plugin', 'dsh-plugin-tool-firewall')
    tag.setAttribute('data-plugin-css', 'tool-firewall/layout')
    tag.textContent = LAYOUT_CSS
    document.head.appendChild(tag)
    return () => {
      if (tag.parentNode !== null && tag.parentNode !== undefined) tag.parentNode.removeChild(tag)
    }
  }, 'tool-firewall: layout')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: STATS_ID,
    order: 6,
    locale: NS,
    inject: () => ({ statsStore, open }),
  }, FirewallStats))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: OVERLAY_ID,
    order: 110,
    locale: NS,
    inject: () => ({ uiStore, close, configForm }),
  }, FirewallSettingsDialog))

  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    key: CONFIG_KEY,
    locale: NS,
    inject: () => ({ configForm }),
  }, SettingsForm))
}
