import FirewallSettingsDialog from './components/FirewallSettingsDialog.jsx'
import FirewallStats from './components/FirewallStats.jsx'
import SettingsForm from './components/SettingsForm.jsx'
import { CONFIG_KEY, INJECT, LAYOUT_CSS, NS, OVERLAY_ID, ROW_ID, STATS_ID } from './constants.js'
import { normalizeConfig } from './lib/config.js'
import { createValueStore } from './lib/store.js'
import { EN, ZH } from './locale.js'

/**
 * Tool Firewall — Client half.
 *
 * Registers the Plugin Manager configure page, the Plugins-list item, a
 * sidebar stats card, and the stats card's settings dialog. All persistence
 * goes through the Host-owned Config form.
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

function buildStats(value) {
  const config = normalizeConfig(value)
  return [
    { labelKey: 'stats.firewall', valueKey: config.enabled ? 'stats.on' : 'stats.off' },
    { labelKey: 'stats.embedding', valueKey: config.embeddingEnabled ? 'stats.on' : 'stats.off' },
    { labelKey: 'stats.classifier', valueKey: config.classifierEnabled ? 'stats.on' : 'stats.off' },
    { labelKey: 'stats.mode', valueKey: config.semanticFailure === 'closed' ? 'stats.closed' : 'stats.open' },
  ]
}

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'tool-firewall: dictionaries')
  const bindT = ctx.locale.bind(NS)
  const configForm = ctx.configForms.get(ROW_ID)
  const statsStore = createValueStore(buildStats(readConfigValue(configForm)))
  const uiStore = createValueStore({ open: false })
  const open = () => uiStore.set({ open: true })
  const close = () => uiStore.set({ open: false })

  ctx.effect(() => {
    const refresh = () => statsStore.set(buildStats(readConfigValue(configForm)))
    refresh()
    return configForm.subscribe(refresh)
  }, 'tool-firewall: stats')

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

  ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item',
    id: ROW_ID,
    order: 55,
    locale: NS,
    label: () => bindT('config.title'),
    inject: () => ({ configForm }),
  }, SettingsForm))
}
