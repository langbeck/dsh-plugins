/** Config normalization shared by the balance poller and the settings form. */

import { DEFAULT_CONFIG, MAX_REFRESH_SECONDS } from '../constants.js'

export function normalizeConfig(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  let refreshSeconds = Number(source.refreshSeconds)
  if (!Number.isFinite(refreshSeconds)) refreshSeconds = DEFAULT_CONFIG.refreshSeconds
  refreshSeconds = Math.min(MAX_REFRESH_SECONDS, Math.max(0, Math.round(refreshSeconds)))
  let pricingRefreshSeconds = Number(source.pricingRefreshSeconds)
  if (!Number.isFinite(pricingRefreshSeconds)) pricingRefreshSeconds = DEFAULT_CONFIG.pricingRefreshSeconds
  pricingRefreshSeconds = Math.min(86_400, Math.max(60, Math.round(pricingRefreshSeconds)))
  return {
    refreshSeconds,
    showZeroBalances: source.showZeroBalances !== false,
    showCurrencyName: source.showCurrencyName !== false,
    pricingRefreshSeconds,
  }
}
