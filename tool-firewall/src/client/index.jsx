import SettingsForm from './components/SettingsForm.jsx'
import { CONFIG_KEY, INJECT, NS, ROW_ID } from './constants.js'
import { EN, ZH } from './locale.js'

/**
 * Tool Firewall — Client half.
 *
 * Registers the Plugin Manager configure page and Plugins-list settings item.
 * All persistence goes through the Host-owned Config form; the Host applies
 * the same defaults and validation from `src/config.js`.
 */
export default function createClient() {
  return { apply, inject: INJECT }
}

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'tool-firewall: dictionaries')
  const bindT = ctx.locale.bind(NS)
  const configForm = ctx.configForms.get(ROW_ID)

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
