/** Shared constants for the Balance Client half. */

export const NS = 'balance'
export const PACKAGE = 'dsh-plugin-balance'
export const ROW_ID = 'balance'
export const CONFIG_KEY = `${PACKAGE}#${ROW_ID}`

export const INJECT = ['slots', 'locale', 'remote', 'remote.account', 'configForms']

export const DEFAULT_CONFIG = Object.freeze({
  refreshSeconds: 60,
  showZeroBalances: true,
  showCurrencyName: true,
  pricingRefreshSeconds: 3600,
})

export const MAX_REFRESH_SECONDS = 3600
export const CURRENCY_ORDER = ['USD', 'CNY']
export const CURRENCY_SYMBOLS = { USD: '$', CNY: '¥' }

export const COST_ROUTE = '/api/balance-session-cost'
export const EVENTS_ROUTE = '/api/balance-events'
export const COST_REFRESH_MS = 60_000
export const COST_CHANGED_EVENT = 'dsh-plugin-balance:cost-changed'

/**
 * The sidebar footer lays its entries out in a single flex row. Wrapping that
 * row only while this plugin's full-width entry is present keeps the balance on
 * a line of its own; without the block the shipped layout is untouched.
 */
export const LAYOUT_CSS = [
  'div:has(> [data-slot="sidebar.footer.action"] > [data-balance-pill]) {',
  '  flex-wrap: wrap;',
  '}',
].join('\n')
