import { useEffect, useRef } from 'react'

import { COST_CHANGED_EVENT, COST_REFRESH_MS } from '../constants.js'
import { useNow, useSnapshot } from '../lib/hooks.js'
import { formatUsd, summaryText, visibleWallets, walletAmountText } from '../lib/money.js'
import { compactTimeLabel, relativeTimeParts } from '../lib/time.js'
import {
  amountStyle,
  codeStyle,
  contentStyle,
  pillStyle,
  rowLabelStyle,
  rowStyle,
  remainingStyle,
  separatorStyle,
  timeStyle,
  walletStyle,
} from '../lib/styles.js'

/** The full-width footer block: balance rows over the current Session cost. */
export default function BalanceRow(props) {
  const { wide = true, t, useSessions, useSessionStatus } = props
  const { balanceStore, configStore, costStore, refreshBalance, refreshCost } = props

  const balance = useSnapshot(balanceStore)
  const config = useSnapshot(configStore)
  const cost = useSnapshot(costStore)
  const now = useNow(30_000)

  const sessionId = useSessions((state) => {
    if (state === null || state === undefined || state.byId === null || state.byId === undefined) return undefined
    for (const id of Object.keys(state.byId)) {
      const row = state.byId[id]
      if (row !== null && row !== undefined && row.retainedBy !== null && row.retainedBy !== undefined && row.retainedBy.mainView > 0) return id
    }
    return undefined
  })

  const runningKey = useSessionStatus((snapshot) => {
    if (snapshot === undefined || snapshot === null) return ''
    const ids = []
    for (const [id, status] of snapshot) {
      if (status !== undefined && status !== null && status.running === true) ids.push(id)
    }
    return ids.join('|')
  })
  const previousRunning = useRef(new Set())
  useEffect(() => {
    const current = new Set(runningKey === '' ? [] : runningKey.split('|'))
    let finished = false
    for (const id of previousRunning.current) {
      if (!current.has(id)) finished = true
    }
    previousRunning.current = current
    if (finished) {
      refreshBalance()
      if (typeof sessionId === 'string') void refreshCost(sessionId)
    }
  }, [runningKey])

  useEffect(() => {
    if (typeof sessionId !== 'string') {
      void refreshCost('')
      return undefined
    }
    void refreshCost(sessionId)
    const timer = setInterval(() => {
      void refreshCost(sessionId)
    }, COST_REFRESH_MS)
    return () => {
      clearInterval(timer)
    }
  }, [sessionId])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
    const onCostChanged = () => {
      if (typeof sessionId === 'string') void refreshCost(sessionId)
    }
    window.addEventListener(COST_CHANGED_EVENT, onCostChanged)
    return () => window.removeEventListener(COST_CHANGED_EVENT, onCostChanged)
  }, [sessionId, refreshCost])

  const wallets = visibleWallets(balance.wallets, config)
  if (balance.status !== 'ready' || wallets.length === 0) return null
  const ariaLabel = `${t('pill.aria')}: ${summaryText(wallets, config)}`
  const walletNodes = wallets.map((wallet, index) => (
    <span key={wallet.currency} style={walletStyle}>
      {index > 0 ? (
        <span aria-hidden="true" style={separatorStyle(wide)}>
          +
        </span>
      ) : null}
      <span style={amountStyle}>{walletAmountText(wallet)}</span>
      {wide && config.showCurrencyName ? <span style={codeStyle}>{wallet.currency}</span> : null}
    </span>
  ))

  if (!wide) {
    return (
      <div data-balance-pill="" role="status" aria-label={ariaLabel} style={pillStyle(false)}>
        {walletNodes}
      </div>
    )
  }

  const costPending = cost.status === 'loading' || cost.status === 'refreshing'
  return (
    <div data-balance-pill="" role="status" aria-label={ariaLabel} style={pillStyle(true)}>
      <div style={contentStyle}>
        <div style={rowStyle}>
          <span style={rowLabelStyle}>{t('row.balance')}</span>
          {walletNodes}
        </div>
        {typeof sessionId === 'string' ? (
          <div style={rowStyle}>
            <span style={rowLabelStyle}>{t('row.session')}</span>
            {cost.status === 'ready' && cost.sessionId === sessionId ? (
              <span style={walletStyle}>
                <span style={amountStyle}>{formatUsd(cost.totalUsd)}</span>
                <span style={codeStyle}>USD</span>
              </span>
            ) : (
              <span style={amountStyle}>{costPending ? '…' : '—'}</span>
            )}
          </div>
        ) : null}
        {typeof sessionId === 'string' && cost.status === 'ready' && cost.sessionId === sessionId && typeof cost.limitUsd === 'number' ? (
          <div style={rowStyle}>
            <span style={rowLabelStyle}>{t('row.limit')}</span>
            <span style={walletStyle}>
              <span style={amountStyle}>{formatUsd(cost.limitUsd)}</span>
              <span style={codeStyle}>USD</span>
              {typeof cost.remainingUsd === 'number' ? (
                <span style={remainingStyle(cost.remainingUsd)}>{t('row.remaining', { amount: formatUsd(cost.remainingUsd) })}</span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
      <span style={timeStyle}>{compactTimeLabel(relativeTimeParts(balance.updatedAt, now), t)}</span>
    </div>
  )
}
