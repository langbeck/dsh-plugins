import { useEffect, useState } from 'react'

import { normalizeConfig } from '../lib/config.js'
import { useSnapshot } from '../lib/hooks.js'
import {
  checkboxStyle,
  errorStyle,
  fieldStyle,
  footerStyle,
  hintStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '../lib/styles.js'

/** Settings page shared by the Plugins-list item and the bundle row's Configure page. */
export default function SettingsForm(props) {
  const { view, t, configForm } = props
  const snapshot = useSnapshot(configForm)
  const resolved = normalizeConfig(snapshot.value)
  const [draft, setDraft] = useState(resolved)
  const [notice, setNotice] = useState('idle')
  const revision = snapshot.revision

  useEffect(() => {
    setDraft(normalizeConfig(configForm.getSnapshot().value))
    setNotice('idle')
  }, [revision])

  if (view === 'summary') return <span>{t('config.summary')}</span>
  if (snapshot.status === 'loading') return <p style={hintStyle}>{t('config.loading')}</p>
  if (snapshot.status === 'unavailable') return <p style={hintStyle}>{t('config.unavailable')}</p>

  const writable = snapshot.writable === true
  const saving = notice === 'saving'
  const disabled = !writable || saving

  function submit(ops) {
    setNotice('saving')
    Promise.resolve()
      .then(() => configForm.mutate(ops, configForm.getSnapshot().revision))
      .then((accepted) => setNotice(accepted === true ? 'saved' : 'error'))
      .catch(() => setNotice('error'))
  }

  function save() {
    const next = normalizeConfig(draft)
    setDraft(next)
    submit([
      { op: 'set', path: ['refreshSeconds'], value: next.refreshSeconds },
      { op: 'set', path: ['showZeroBalances'], value: next.showZeroBalances },
      { op: 'set', path: ['showCurrencyName'], value: next.showCurrencyName },
      { op: 'set', path: ['pricingRefreshSeconds'], value: next.pricingRefreshSeconds },
    ])
  }

  function reset() {
    submit([
      { op: 'unset', path: ['refreshSeconds'] },
      { op: 'unset', path: ['showZeroBalances'] },
      { op: 'unset', path: ['showCurrencyName'] },
      { op: 'unset', path: ['pricingRefreshSeconds'] },
    ])
  }

  const noticeText = notice === 'saved'
    ? t('config.saved')
    : notice === 'error'
      ? t('config.saveError')
      : notice === 'saving'
        ? t('config.saving')
        : ''

  return (
    <div style={pageStyle}>
      <label style={fieldStyle}>
        <span style={labelStyle}>{t('config.refresh')}</span>
        <input
          type="number"
          min={0}
          max={3600}
          step={1}
          value={String(draft.refreshSeconds)}
          disabled={disabled}
          aria-label={t('config.refresh')}
          onChange={(event) => {
            const next = Number(event.target.value)
            const value = Number.isFinite(next) ? Math.min(3600, Math.max(0, Math.round(next))) : 0
            setDraft({ ...draft, refreshSeconds: value })
          }}
          style={inputStyle(disabled)}
        />
        <span style={hintStyle}>{t('config.refreshHint')}</span>
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>{t('config.pricingRefresh')}</span>
        <input
          type="number"
          min={60}
          max={86_400}
          step={1}
          value={String(draft.pricingRefreshSeconds)}
          disabled={disabled}
          aria-label={t('config.pricingRefresh')}
          onChange={(event) => {
            const next = Number(event.target.value)
            const value = Number.isFinite(next) ? Math.min(86_400, Math.max(60, Math.round(next))) : 3600
            setDraft({ ...draft, pricingRefreshSeconds: value })
          }}
          style={inputStyle(disabled)}
        />
        <span style={hintStyle}>{t('config.pricingRefreshHint')}</span>
      </label>

      <label style={checkboxStyle}>
        <input
          type="checkbox"
          checked={draft.showZeroBalances}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, showZeroBalances: event.target.checked })}
        />
        <span style={labelStyle}>{t('config.showZeroBalances')}</span>
      </label>

      <label style={checkboxStyle}>
        <input
          type="checkbox"
          checked={draft.showCurrencyName}
          disabled={disabled}
          onChange={(event) => setDraft({ ...draft, showCurrencyName: event.target.checked })}
        />
        <span style={labelStyle}>{t('config.showCurrencyCodes')}</span>
      </label>

      <div style={footerStyle}>
        <button type="button" disabled={disabled} onClick={save} style={primaryButtonStyle(disabled)}>
          {t('config.save')}
        </button>
        <button type="button" disabled={disabled} onClick={reset} style={secondaryButtonStyle(disabled)}>
          {t('config.reset')}
        </button>
        {noticeText === '' ? null : (
          <span role={notice === 'error' ? 'alert' : 'status'} style={notice === 'error' ? errorStyle : hintStyle}>
            {noticeText}
          </span>
        )}
      </div>
      {writable ? null : <p style={hintStyle}>{t('config.readOnly')}</p>}
    </div>
  )
}
