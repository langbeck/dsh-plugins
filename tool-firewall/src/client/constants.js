/** Shared constants for the tool firewall Client half. */

import { DEFAULT_CONFIG } from '../config.js'

export const NS = 'toolFirewall'
export const PACKAGE = 'dsh-plugin-tool-firewall'
export const ROW_ID = 'tool-firewall'
export const CONFIG_KEY = `${PACKAGE}#${ROW_ID}`
export const INJECT = ['slots', 'locale', 'configForms']
export const STATS_ID = 'tool-firewall'
export const OVERLAY_ID = 'tool-firewall-settings'
export const STATS_ROUTE = '/api/tool-firewall-stats'
export const LOGS_ROUTE = '/api/tool-firewall-logs'

/**
 * Footer entries lay out in one flex row. Wrapping while this card is present
 * keeps the stats block on its own line, matching the Balance footer block.
 */
export const LAYOUT_CSS = [
  'div:has(> [data-slot="sidebar.footer.action"] > [data-tool-firewall-pill]) {',
  '  flex-wrap: wrap;',
  '}',
].join('\n')

export { DEFAULT_CONFIG }
