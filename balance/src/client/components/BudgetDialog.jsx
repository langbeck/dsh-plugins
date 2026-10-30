import { useEffect, useState } from 'react'

import { LIMIT_ROUTE } from '../constants.js'
import { useSnapshot } from '../lib/hooks.js'

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  background: 'rgba(0, 0, 0, 0.32)',
  boxSizing: 'border-box',
}

const panelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  width: 'min(420px, 100%)',
  padding: '16px',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-lg, 12px)',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.32)',
  boxSizing: 'border-box',
}

const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }
const titleStyle = { margin: 0, fontSize: '15px', lineHeight: '22px', fontWeight: 600 }
const rowStyle = { display: 'flex', flexDirection: 'column', gap: '6px' }
const labelStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px', fontWeight: 600 }
const scopeStyle = { display: 'flex', gap: '6px' }
const scopeButtonStyle = (active) => ({
  height: '30px',
  padding: '0 10px',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-md, 8px)',
  background: active ? 'var(--dsw-alias-bg-layer-3)' : 'transparent',
  color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
  font: 'inherit',
  fontSize: '12px',
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
})
const inputStyle = {
  boxSizing: 'border-box',
  width: '100%',
  height: '32px',
  padding: '0 10px',
  border: '0.5px solid var(--dsw-alias-border-l4)',
  borderRadius: 'var(--dsw-radius-md, 8px)',
  background: 'var(--dsw-alias-bg-layer-3)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: '13px',
}
const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px', lineHeight: '16px' }
const footerStyle = { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }
const buttonStyle = (primary) => ({
  height: '30px',
  padding: '0 12px',
  border: primary ? 'none' : '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-md, 8px)',
  background: primary ? 'var(--dsw-alias-button-primary-fill, #4d6bfe)' : 'transparent',
  color: primary ? 'var(--dsw-alias-label-primary-foreground, #fff)' : 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: '12px',
  cursor: 'pointer',
})
const messageStyle = { margin: 0, fontSize: '11px', lineHeight: '16px' }

/** Client-owned Budget dialog; mutates limits through the Host limit route. */
export default function BudgetDialog({ uiStore, costStore, refreshCost, t }) {
  const ui = useSnapshot(uiStore)
  const cost = useSnapshot(costStore)
  const [scope, setScope] = useState('session')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(undefined)

  useEffect(() => {
    if (!ui.open) return
    setScope('session')
    setAmount('')
    setBusy(false)
    setMessage(undefined)
  }, [ui.open])

  if (!ui.open || typeof ui.sessionId !== 'string') return null
  const current = cost.status === 'ready' && cost.sessionId === ui.sessionId
    ? (scope === 'turn' ? cost.turnLimitUsd : cost.limitUsd)
    : null

  async function send(value) {
    if (busy) return
    setBusy(true)
    setMessage(undefined)
    try {
      const response = await fetch(LIMIT_ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: ui.sessionId, scope, input: value }),
      })
      const result = await response.json()
      if (result.ok !== true) {
        setMessage({ error: true, text: result.error?.message ?? t('budget.failed') })
        return
      }
      setAmount('')
      setMessage({ error: false, text: result.value.text ?? t('budget.saved') })
      refreshCost(ui.sessionId)
    } catch (error) {
      setMessage({ error: true, text: t('budget.failed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={backdropStyle} onMouseDown={(event) => { if (event.target === event.currentTarget) uiStore.set({ open: false }) }}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label={t('budget.title')}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>{t('budget.title')}</h2>
          <button type="button" style={buttonStyle(false)} onClick={() => uiStore.set({ open: false })}>{t('budget.close')}</button>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{t('budget.scope')}</span>
          <div style={scopeStyle}>
            <button type="button" style={scopeButtonStyle(scope === 'session')} onClick={() => { setScope('session'); setMessage(undefined) }}>{t('budget.session')}</button>
            <button type="button" style={scopeButtonStyle(scope === 'turn')} onClick={() => { setScope('turn'); setMessage(undefined) }}>{t('budget.turn')}</button>
          </div>
          <span style={hintStyle}>{current === null ? t('budget.notSet') : t('budget.current', { amount: '$' + Number(current).toFixed(2) })}</span>
        </div>
        <label style={rowStyle}>
          <span style={labelStyle}>{t('budget.amount')}</span>
          <input
            type="text"
            value={amount}
            disabled={busy}
            placeholder="+2, -2, 5, off"
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void send(amount) }}
            style={inputStyle}
            aria-label={t('budget.amount')}
          />
          <span style={hintStyle}>{t('budget.amountHint')}</span>
        </label>
        {message === undefined ? null : <p style={{ ...messageStyle, color: message.error ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' }}>{message.text}</p>}
        <div style={footerStyle}>
          <button type="button" style={buttonStyle(false)} disabled={busy} onClick={() => void send('off')}>{t('budget.clear')}</button>
          <button type="button" style={buttonStyle(true)} disabled={busy || amount.trim() === ''} onClick={() => void send(amount)}>{t('budget.apply')}</button>
        </div>
      </div>
    </div>
  )
}
