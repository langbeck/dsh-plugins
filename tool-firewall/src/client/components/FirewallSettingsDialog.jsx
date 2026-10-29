import { useEffect, useState } from 'react'

import { LOGS_ROUTE } from '../constants.js'
import { useSnapshot } from '../lib/hooks.js'
import {
  dialogBackdropStyle,
  dialogBodyStyle,
  dialogCloseStyle,
  dialogHeaderStyle,
  dialogPanelStyle,
  dialogSubtitleStyle,
  dialogTitleStyle,
} from '../lib/styles.js'
import SettingsForm from './SettingsForm.jsx'

/** Modal wrapper around the existing settings form. */
export default function FirewallSettingsDialog(props) {
  const { uiStore, close, t, configForm } = props
  const ui = useSnapshot(uiStore)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    if (!ui.open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.open, close])

  useEffect(() => {
    if (!ui.open || typeof window === 'undefined' || typeof fetch !== 'function') return undefined
    let disposed = false
    let timer
    if (logs.length === 0) setLogsLoading(true)
    const tick = () => {
      if (disposed) return
      Promise.resolve()
        .then(() => fetch(LOGS_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }))
        .then((response) => response.ok ? response.json() : undefined)
        .then((result) => {
          if (disposed || result === undefined || result.ok !== true) return
          const value = result.value
          if (value === undefined || !Array.isArray(value.logs)) return
          setLogs(value.logs)
          setLogsLoading(false)
        })
        .catch(() => {
          if (!disposed) setLogsLoading(false)
        })
    }
    tick()
    timer = setInterval(tick, 3000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [ui.open])

  if (!ui.open) return null
  return (
    <div
      style={dialogBackdropStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div style={dialogPanelStyle} role="dialog" aria-modal="true" aria-label={t('config.title')}>
        <div style={dialogHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <h2 style={dialogTitleStyle}>{t('config.title')}</h2>
            <p style={dialogSubtitleStyle}>{t('config.summary')}</p>
          </div>
          <button type="button" style={dialogCloseStyle()} aria-label={t('dialog.close')} title={t('dialog.close')} onClick={close}>
            ×
          </button>
        </div>
        <div style={dialogBodyStyle}>
          <SettingsForm view="page" t={t} configForm={configForm} tabbed logs={logs} logsLoading={logsLoading} />
        </div>
      </div>
    </div>
  )
}
