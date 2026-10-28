/** Pure money/currency helpers. Amounts are summed per currency at display precision. */

import { CURRENCY_ORDER, CURRENCY_SYMBOLS } from '../constants.js'

/** Read one wallet's currency and amount; undefined when the wallet is malformed. */
function readWallet(wallet) {
  if (wallet === null || typeof wallet !== 'object') return undefined
  const currency = typeof wallet.currency === 'string' ? wallet.currency.trim().toUpperCase() : ''
  if (currency === '') return undefined
  const amount = typeof wallet.balance === 'number' ? wallet.balance : Number(wallet.balance)
  if (!Number.isFinite(amount)) return undefined
  return { currency, amount }
}

function currencyRank(currency) {
  const index = CURRENCY_ORDER.indexOf(currency)
  return index === -1 ? CURRENCY_ORDER.length : index
}

export function orderWalletList(wallets) {
  return wallets.slice().sort((left, right) => {
    const rank = currencyRank(left.currency) - currencyRank(right.currency)
    if (rank !== 0) return rank
    if (left.currency === right.currency) return 0
    return left.currency < right.currency ? -1 : 1
  })
}

/** Sum every currency across the given wallet lists (topped-up and granted together). */
export function sumWallets(groups) {
  const totals = new Map()
  for (const group of groups) {
    if (!Array.isArray(group)) continue
    for (const wallet of group) {
      const read = readWallet(wallet)
      if (read === undefined) continue
      totals.set(read.currency, (totals.get(read.currency) || 0) + read.amount)
    }
  }
  const result = []
  for (const [currency, amount] of totals) result.push({ currency, amount })
  return orderWalletList(result)
}

/** Hide exactly-zero currencies when the switch is off. */
export function visibleWallets(wallets, config) {
  return wallets.filter((wallet) => config.showZeroBalances || Math.abs(wallet.amount) > 1e-9)
}

const AMOUNT_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Platform Web's display rule: two decimals, positive sub-cent values as <0.01. */
export function formatAmount(amount) {
  if (Math.abs(amount) > 0 && Math.abs(amount) < 0.01) return '<0.01'
  return AMOUNT_FORMAT.format(amount)
}

/** Symbol plus amount, falling back to the currency code for unknown currencies. */
export function walletAmountText(wallet) {
  const symbol = CURRENCY_SYMBOLS[wallet.currency]
  const amount = formatAmount(wallet.amount)
  return symbol === undefined ? `${amount} ${wallet.currency}` : `${symbol}${amount}`
}

/** One wallet's rendered text, e.g. `$2.55 CNY` (or `$2.55` without the code). */
export function walletText(wallet, showCurrencyName) {
  const symbol = CURRENCY_SYMBOLS[wallet.currency]
  if (symbol === undefined) return `${formatAmount(wallet.amount)} ${wallet.currency}`
  const amount = symbol + formatAmount(wallet.amount)
  return showCurrencyName ? `${amount} ${wallet.currency}` : amount
}

/** The block's accessible summary, e.g. `$0.00 USD + ¥2.55 CNY`. */
export function summaryText(wallets, config) {
  return wallets.map((wallet) => walletText(wallet, config.showCurrencyName)).join(' + ')
}

/** Compact USD estimate text for the Session row. */
export function formatUsd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '$0.00'
  if (value >= 0.01) return '$' + value.toFixed(2)
  if (value >= 0.0001) return '$' + value.toFixed(4)
  return '<$0.0001'
}
