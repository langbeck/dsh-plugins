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
  modelCardBodyStyle,
  modelCardStyle,
  modelCardSummaryStyle,
  modelListStyle,
  modelStatusStyle,
  modelWarningStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionStyle,
  sectionTitleStyle,
  tabbedSectionStyle,
  selectStyle,
  tabBarStyle,
  tabButtonStyle,
  tabbedFooterStyle,
  tabbedScrollStyle,
  tabbedShellStyle,
  tabIconStyle,
} from '../lib/styles.js'
import LogsPanel from './LogsPanel.jsx'

const FIELDS = Object.keys(DEFAULT_CONFIG)
const TABS = [
  { id: 'general', labelKey: 'section.general', icon: ['M4 7h16', 'M4 12h16', 'M4 17h16'] },
  { id: 'detection', labelKey: 'section.detection', icon: ['M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6l7-3Z', 'm9 12 2 2 4-4'] },
  { id: 'models', labelKey: 'section.models', icon: ['M7 7h10v10H7z', 'M9 3v4', 'M15 3v4', 'M9 17v4', 'M15 17v4', 'M3 9h4', 'M3 15h4', 'M17 9h4', 'M17 15h4'] },
  { id: 'cache', labelKey: 'section.cache', icon: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z', 'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'] },
  { id: 'logs', labelKey: 'tab.logs', icon: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h1', 'M4 12h1', 'M4 18h1'] },
]

function TabIcon({ paths }) {
  return (
    <svg style={tabIconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((path) => <path key={path} d={path} />)}
    </svg>
  )
}

function modelStatus(model, enabled) {
  if (enabled !== true) return { key: 'stats.disabled', tone: 'muted' }
  if (model?.state === 'error') return { key: 'stats.error', tone: 'error' }
  if (model?.state === 'ready') return { key: 'stats.ready' }
  return { key: 'stats.loading', tone: 'muted' }
}

function ModelCard({ title, model, enabled, t, children }) {
  const status = modelStatus(model, enabled)
  return (
    <details style={modelCardStyle}>
      <summary style={modelCardSummaryStyle}>
        <span>{title}</span>
        {model === undefined ? null : <span style={modelStatusStyle(status.tone)}>{t(status.key)}</span>}
      </summary>
      <div style={modelCardBodyStyle}>{children}</div>
    </details>
  )
}

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
  if (draft.outputGuardEnabled && (draft.outputGuardModel.trim() === '' || draft.outputGuardRevision.trim() === '')) {
    return 'config.invalidOutputGuard'
  }
  for (const key of ['maliceThreshold', 'alignmentThreshold', 'maxCommandChars', 'maxTextTokens', 'modelTimeoutMs', 'cacheEntries', 'cacheTtlMs', 'outputGuardThreshold', 'outputGuardMaxChars', 'outputGuardChunkChars', 'outputGuardTimeoutMs']) {
    if (!Number.isFinite(Number(draft[key]))) return 'config.invalid'
  }
  return undefined
}

export default function SettingsForm(props) {
  const { view, t, configForm, tabbed = false, logs = [], logsLoading = false, models = undefined, onInspect = () => {} } = props
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

  const modelIssues = []
  if (models?.embedding?.state === 'error') {
    modelIssues.push({ key: 'embedding', model: t('stats.embeddingModel'), error: String(models.embedding.error ?? 'unknown error') })
  }
  if (models?.classifier?.state === 'error') {
    modelIssues.push({ key: 'classifier', model: t('stats.classifierModel'), error: String(models.classifier.error ?? 'unknown error') })
  }
  if (models?.outputGuard?.state === 'error') {
    modelIssues.push({ key: 'outputGuard', model: t('stats.outputGuard'), error: String(models.outputGuard.error ?? 'unknown error') })
  }

  return (
    <div style={tabbed ? tabbedShellStyle : pageStyle}>
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
              <TabIcon paths={entry.icon} />
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
      ) : null}

      <div style={tabbed ? tabbedScrollStyle : { display: 'contents' }}>
        {tabbed && modelIssues.length > 0 ? (
          <div style={modelWarningStyle}>
            {modelIssues.map((entry) => (
              <p key={entry.key} style={errorStyle}>{t('logs.modelError', { model: entry.model, error: entry.error })}</p>
            ))}
          </div>
        ) : null}

        {!tabbed || tab === 'general' ? (
        <section style={tabbed ? tabbedSectionStyle : sectionStyle}>
          {tabbed ? null : <h3 style={sectionTitleStyle}>{t('section.general')}</h3>}
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
        <section style={tabbed ? tabbedSectionStyle : sectionStyle}>
          {tabbed ? null : <h3 style={sectionTitleStyle}>{t('section.detection')}</h3>}
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
        <section style={tabbed ? tabbedSectionStyle : sectionStyle}>
          {tabbed ? null : <h3 style={sectionTitleStyle}>{t('section.models')}</h3>}
          <div style={modelListStyle}>
          <ModelCard title={t('model.embedding')} model={models?.embedding} enabled={draft.embeddingEnabled} t={t}>
            {checkboxField('embeddingEnabled')}
            <span style={hintStyle}>{t('field.embeddingEnabledHint')}</span>
            {textField('embeddingModel', '100%', undefined, !draft.embeddingEnabled)}
            {textField('embeddingRevision', '100%', undefined, !draft.embeddingEnabled)}
          </ModelCard>

          <ModelCard title={t('model.classifier')} model={models?.classifier} enabled={draft.classifierEnabled} t={t}>
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
          </ModelCard>

          <ModelCard title={t('model.outputGuard')} model={models?.outputGuard} enabled={draft.outputGuardEnabled} t={t}>
            {checkboxField('outputGuardEnabled')}
            <span style={hintStyle}>{t('field.outputGuardEnabledHint')}</span>
            {textField('outputGuardModel', '100%', undefined, !draft.outputGuardEnabled)}
            {textField('outputGuardRevision', '100%', undefined, !draft.outputGuardEnabled)}
            <label style={fieldStyle}>
              <span style={labelStyle}>{t('field.outputGuardTools')}</span>
              <input
                type="text"
                value={listToText(draft.outputGuardTools)}
                disabled={disabled || !draft.outputGuardEnabled}
                aria-label={t('field.outputGuardTools')}
                onChange={(event) => update('outputGuardTools', textToList(event.target.value))}
                style={inputStyle(disabled || !draft.outputGuardEnabled, '100%')}
              />
              <span style={hintStyle}>{t('field.outputGuardToolsHint')}</span>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>{t('field.outputGuardLabels')}</span>
              <input
                type="text"
                value={listToText(draft.outputGuardLabels)}
                disabled={disabled || !draft.outputGuardEnabled}
                aria-label={t('field.outputGuardLabels')}
                onChange={(event) => update('outputGuardLabels', textToList(event.target.value))}
                style={inputStyle(disabled || !draft.outputGuardEnabled, '100%')}
              />
              <span style={hintStyle}>{t('field.outputGuardLabelsHint')}</span>
            </label>
            {numberField('outputGuardThreshold', 0, 1, 0.01)}
            {numberField('outputGuardMaxChars', 256, 200000, 1)}
            {numberField('outputGuardChunkChars', 256, 16000, 1)}
            {numberField('outputGuardTimeoutMs', 10, 5000, 1)}
            <label style={fieldStyle}>
              <span style={labelStyle}>{t('field.outputGuardMode')}</span>
              <select
                value={draft.outputGuardMode}
                disabled={disabled || !draft.outputGuardEnabled}
                onChange={(event) => update('outputGuardMode', event.target.value)}
                style={selectStyle(disabled || !draft.outputGuardEnabled)}
              >
                <option value="quarantine">{t('option.quarantine')}</option>
                <option value="block">{t('option.block')}</option>
              </select>
              <span style={hintStyle}>{t('field.outputGuardModeHint')}</span>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>{t('field.outputGuardFailureMode')}</span>
              <select
                value={draft.outputGuardFailureMode}
                disabled={disabled || !draft.outputGuardEnabled}
                onChange={(event) => update('outputGuardFailureMode', event.target.value)}
                style={selectStyle(disabled || !draft.outputGuardEnabled)}
              >
                <option value="open">{t('option.outputOpen')}</option>
                <option value="closed">{t('option.outputClosed')}</option>
              </select>
              <span style={hintStyle}>{t('field.outputGuardFailureModeHint')}</span>
            </label>
          </ModelCard>
          </div>

          {checkboxField('allowRemoteModels')}
          <span style={hintStyle}>{t('field.allowRemoteModelsHint')}</span>
        </section>
      ) : null}

      {!tabbed || tab === 'cache' ? (
        <section style={tabbed ? tabbedSectionStyle : sectionStyle}>
          {tabbed ? null : <h3 style={sectionTitleStyle}>{t('section.cache')}</h3>}
          {numberField('maxCommandChars', 64, 65536, 1)}
          {numberField('maxTextTokens', 16, 512, 1)}
          {numberField('cacheEntries', 1, 4096, 1)}
          {numberField('cacheTtlMs', 1000, 86400000, 1000)}
        </section>
      ) : null}

        {tabbed && tab === 'logs' ? <LogsPanel logs={logs} loading={logsLoading} models={models} onInspect={onInspect} t={t} /> : null}
      </div>

      <div style={tabbed ? tabbedFooterStyle : footerStyle}>
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
        {writable ? null : <p style={hintStyle}>{t('config.readOnly')}</p>}
      </div>
    </div>
  )
}
