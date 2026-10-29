import { useEffect, useState } from 'react'

import { DEFAULT_CONFIG, normalizeConfig } from '../../config.js'
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
  sectionStyle,
  sectionTitleStyle,
  selectStyle,
  tabBarStyle,
  tabButtonStyle,
} from '../lib/styles.js'
import LogsPanel from './LogsPanel.jsx'

const FIELDS = Object.keys(DEFAULT_CONFIG)
const TABS = [
  { id: 'general', labelKey: 'section.general' },
  { id: 'detection', labelKey: 'section.detection' },
  { id: 'models', labelKey: 'section.models' },
  { id: 'cache', labelKey: 'section.cache' },
  { id: 'logs', labelKey: 'tab.logs' },
]

function listToText(list) {
  return Array.isArray(list) ? list.join(', ') : ''
}

function textToList(text) {
  const out = []
  for (const part of String(text).split(',')) {
    const value = part.trim()
    if (value !== '' && !out.includes(value)) out.push(value)
  }
  return out
}

function numeric(value) {
  return Number(value)
}

function validDraft(draft) {
  if (draft.bypassRegex !== '') {
    try {
      const pattern = new RegExp(draft.bypassRegex)
      if (pattern.test('')) return 'config.invalidRegex'
    } catch (error) {
      return 'config.invalidRegex'
    }
  }
  if (draft.classifierEnabled && (draft.classifierModel.trim() === '' || draft.classifierRevision.trim() === '')) {
    return 'config.invalidClassifier'
  }
  for (const key of ['maliceThreshold', 'alignmentThreshold', 'maxCommandChars', 'maxTextTokens', 'modelTimeoutMs', 'cacheEntries', 'cacheTtlMs']) {
    if (!Number.isFinite(Number(draft[key]))) return 'config.invalid'
  }
  return undefined
}

export default function SettingsForm(props) {
  const { view, t, configForm, tabbed = false, logs = [], logsLoading = false } = props
  const snapshot = useSnapshot(configForm)
  const resolved = normalizeConfig(snapshot.value)
  const [draft, setDraft] = useState(resolved)
  const [notice, setNotice] = useState('idle')
  const [validation, setValidation] = useState(undefined)
  const [tab, setTab] = useState('general')
  const revision = snapshot.revision

  useEffect(() => {
    setDraft(normalizeConfig(configForm.getSnapshot().value))
    setNotice('idle')
    setValidation(undefined)
  }, [revision])

  if (view === 'summary') return <span>{t('config.summary')}</span>
  if (snapshot.status === 'loading') return <p style={hintStyle}>{t('config.loading')}</p>
  if (snapshot.status === 'unavailable') return <p style={hintStyle}>{t('config.unavailable')}</p>

  const writable = snapshot.writable === true
  const saving = notice === 'saving'
  const disabled = !writable || saving

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setValidation(undefined)
    setNotice('idle')
  }

  function submit(ops) {
    setNotice('saving')
    Promise.resolve()
      .then(() => configForm.mutate(ops, configForm.getSnapshot().revision))
      .then((accepted) => setNotice(accepted === true ? 'saved' : 'error'))
      .catch(() => setNotice('error'))
  }

  function save() {
    const next = normalizeConfig(draft)
    const invalid = validDraft(next)
    if (invalid !== undefined) {
      setValidation(invalid)
      setNotice('error')
      return
    }
    setDraft(next)
    submit(FIELDS.map((field) => ({
      op: 'set',
      path: [field],
      value: Array.isArray(next[field]) ? [...next[field]] : next[field],
    })))
  }

  function reset() {
    setValidation(undefined)
    submit(FIELDS.map((field) => ({ op: 'unset', path: [field] })))
  }

  function textField(field, width = '320px', hint = undefined, extraDisabled = false) {
    return (
      <label style={fieldStyle}>
        <span style={labelStyle}>{t('field.' + field)}</span>
        <input
          type="text"
          value={String(draft[field] ?? '')}
          disabled={disabled || extraDisabled}
          aria-label={t('field.' + field)}
          onChange={(event) => update(field, event.target.value)}
          style={inputStyle(disabled || extraDisabled, width)}
        />
        <span style={hintStyle}>{t('field.' + field + 'Hint')}</span>
      </label>
    )
  }

  function numberField(field, min, max, step, hint = undefined) {
    return (
      <label style={fieldStyle}>
        <span style={labelStyle}>{t('field.' + field)}</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={String(draft[field] ?? '')}
          disabled={disabled}
          aria-label={t('field.' + field)}
          onChange={(event) => update(field, numeric(event.target.value))}
          style={inputStyle(disabled)}
        />
        <span style={hintStyle}>{t('field.' + field + 'Hint')}</span>
      </label>
    )
  }

  function checkboxField(field, extraDisabled = false) {
    return (
      <label style={checkboxStyle}>
        <input
          type="checkbox"
          checked={draft[field] === true}
          disabled={disabled || extraDisabled}
          onChange={(event) => update(field, event.target.checked)}
        />
        <span style={labelStyle}>{t('field.' + field)}</span>
      </label>
    )
  }

  const noticeText = validation !== undefined
    ? t(validation)
    : notice === 'saved'
      ? t('config.saved')
      : notice === 'error'
        ? t('config.saveError')
        : notice === 'saving'
          ? t('config.saving')
          : ''

  return (
    <div style={pageStyle}>
      {tabbed ? (
        <div style={tabBarStyle}>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={tabButtonStyle(tab === entry.id)}
              aria-pressed={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
      ) : null}

      {!tabbed || tab === 'general' ? (
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{t('section.general')}</h3>
          {checkboxField('enabled')}
          <span style={hintStyle}>{t('field.enabledHint')}</span>
          <label style={fieldStyle}>
            <span style={labelStyle}>{t('field.semanticFailure')}</span>
            <select
              value={draft.semanticFailure}
              disabled={disabled}
              onChange={(event) => update('semanticFailure', event.target.value)}
              style={selectStyle(disabled)}
            >
              <option value="open">{t('option.open')}</option>
              <option value="closed">{t('option.closed')}</option>
            </select>
            <span style={hintStyle}>{t('field.semanticFailureHint')}</span>
          </label>
          {numberField('modelTimeoutMs', 1, 5000, 1)}
        </section>
      ) : null}

      {!tabbed || tab === 'detection' ? (
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{t('section.detection')}</h3>
          {numberField('maliceThreshold', 0, 1, 0.01)}
          {numberField('alignmentThreshold', 0, 1, 0.01)}
          {textField('bypassRegex', '100%')}
          <label style={fieldStyle}>
            <span style={labelStyle}>{t('field.shellTools')}</span>
            <input
              type="text"
              value={listToText(draft.shellTools)}
              disabled={disabled}
              aria-label={t('field.shellTools')}
              onChange={(event) => update('shellTools', textToList(event.target.value))}
              style={inputStyle(disabled, '100%')}
            />
            <span style={hintStyle}>{t('field.shellToolsHint')}</span>
          </label>
        </section>
      ) : null}

      {!tabbed || tab === 'models' ? (
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{t('section.models')}</h3>
          {checkboxField('embeddingEnabled')}
          <span style={hintStyle}>{t('field.embeddingEnabledHint')}</span>
          {textField('embeddingModel', '100%', undefined, !draft.embeddingEnabled)}
          {textField('embeddingRevision', '100%', undefined, !draft.embeddingEnabled)}
          {checkboxField('classifierEnabled')}
          <span style={hintStyle}>{t('field.classifierEnabledHint')}</span>
          {textField('classifierModel', '100%', undefined, !draft.classifierEnabled)}
          {textField('classifierRevision', '100%', undefined, !draft.classifierEnabled)}
          <label style={fieldStyle}>
            <span style={labelStyle}>{t('field.classifierLabels')}</span>
            <input
              type="text"
              value={listToText(draft.classifierLabels)}
              disabled={disabled || !draft.classifierEnabled}
              aria-label={t('field.classifierLabels')}
              onChange={(event) => update('classifierLabels', textToList(event.target.value))}
              style={inputStyle(disabled || !draft.classifierEnabled, '100%')}
            />
            <span style={hintStyle}>{t('field.classifierLabelsHint')}</span>
          </label>
          {checkboxField('allowRemoteModels')}
          <span style={hintStyle}>{t('field.allowRemoteModelsHint')}</span>
        </section>
      ) : null}

      {!tabbed || tab === 'cache' ? (
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{t('section.cache')}</h3>
          {numberField('maxCommandChars', 64, 65536, 1)}
          {numberField('maxTextTokens', 16, 512, 1)}
          {numberField('cacheEntries', 1, 4096, 1)}
          {numberField('cacheTtlMs', 1000, 86400000, 1000)}
        </section>
      ) : null}

      {tabbed && tab === 'logs' ? <LogsPanel logs={logs} loading={logsLoading} t={t} /> : null}

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
