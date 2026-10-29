import { useEffect } from 'react'

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

  useEffect(() => {
    if (!ui.open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.open, close])

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
          <SettingsForm view="page" t={t} configForm={configForm} />
        </div>
      </div>
    </div>
  )
}
