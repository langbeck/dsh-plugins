import {
  errorStyle,
  logBodyStyle,
  logDecisionStyle,
  logEntryStyle,
  logGridStyle,
  logKeyStyle,
  logLabelStyle,
  logMutedStyle,
  logPreStyle,
  logSectionStyle,
  logSummaryStyle,
  logTimeStyle,
  logToolStyle,
  logValueStyle,
  logsListStyle,
  inspectButtonStyle,
} from '../lib/styles.js'

function timeText(at) {
  if (typeof at !== 'number' || !Number.isFinite(at)) return ''
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function numberText(value, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'
}

/** Recent interceptions, one collapsible row per call. */
export default function LogsPanel(props) {
  const { logs = [], loading = false, models = undefined, onInspect = () => {}, t } = props
  const warnings = []
  if (models?.embedding?.state === 'error') {
    warnings.push({ key: 'embedding', model: t('stats.embeddingModel'), error: String(models.embedding.error ?? 'unknown error') })
  }
  if (models?.classifier?.state === 'error') {
    warnings.push({ key: 'classifier', model: t('stats.classifierModel'), error: String(models.classifier.error ?? 'unknown error') })
  }
  if (models?.outputGuard?.state === 'error') {
    warnings.push({ key: 'outputGuard', model: t('stats.outputGuard'), error: String(models.outputGuard.error ?? 'unknown error') })
  }
  const warning = warnings.length === 0 ? null : (
    <>
      {warnings.map((entry) => (
        <p key={entry.key} style={errorStyle}>{t('logs.modelError', { model: entry.model, error: entry.error })}</p>
      ))}
    </>
  )
  if (loading && logs.length === 0) {
    return (
      <>
        {warning}
        <p style={logMutedStyle}>{t('logs.loading')}</p>
      </>
    )
  }
  if (logs.length === 0) {
    return (
      <>
        {warning}
        <p style={logMutedStyle}>{t('logs.empty')}</p>
      </>
    )
  }
  return (
    <>
      {warning}
      <div style={logsListStyle}>
        {logs.map((log) => {
        const flags = []
        if (log.bypass) flags.push(t('logs.bypass'))
        if (log.cached) flags.push(t('logs.cached'))
        if (log.semanticUnavailable) flags.push(t('logs.unavailable'))
        const isOutput = log.phase === 'output'
        const decisionLabel = isOutput
          ? (log.action === 'allow' ? 'logs.outputAllowed' : log.action === 'block' ? 'logs.blocked' : 'logs.quarantined')
          : (log.blocked ? 'logs.blocked' : 'logs.allowed')
        return (
          <details key={log.id} style={logEntryStyle}>
            <summary style={logSummaryStyle}>
              <span style={logTimeStyle}>{timeText(log.at)}</span>
              <span style={logToolStyle}>{log.tool}</span>
              {flags.length === 0 ? null : <span style={logMutedStyle}>{flags.join(' · ')}</span>}
              <span style={logDecisionStyle(log.blocked)}>{t(decisionLabel)}</span>
            </summary>
            <div style={logBodyStyle}>
              {isOutput ? (
                <div style={logGridStyle}>
                  <span style={logLabelStyle}>{t('logs.outputGuard')}</span>
                  <span style={logValueStyle}>{t('logs.outputScore')}: {numberText(log.outputScore)}</span>
                  <span style={logLabelStyle}>{t('logs.action')}</span>
                  <span style={logValueStyle}>{t(decisionLabel)}</span>
                  <span style={logLabelStyle}>{t('logs.chunks')}</span>
                  <span style={logValueStyle}>{String(log.chunks ?? 0)}{log.truncated ? ' · truncated' : ''}</span>
                  {typeof log.outputExcerpt === 'string' && log.outputExcerpt !== '' ? (
                    <button type="button" style={inspectButtonStyle} onClick={() => onInspect(log)}>{t('logs.inspect')}</button>
                  ) : null}
                </div>
              ) : (
                <div style={logSectionStyle}>
                  <span style={logKeyStyle}>{t('logs.command')}</span>
                  <pre style={logPreStyle}>{log.command === '' ? t('logs.noCommand') : log.command}</pre>
                </div>
              )}
              {typeof log.description === 'string' && log.description !== '' ? (
                <div style={logSectionStyle}>
                  <span style={logKeyStyle}>{t('logs.description')}</span>
                  <pre style={logPreStyle}>{log.description}</pre>
                </div>
              ) : null}
              {isOutput ? null : (
              <div style={logGridStyle}>
                <span style={logLabelStyle}>{t('logs.result')}</span>
                <span style={logValueStyle}>{log.blocked ? t('logs.blocked') : t('logs.allowed')}{log.code === undefined ? '' : ' · ' + log.code}</span>
                <span style={logLabelStyle}>{t('logs.kind')}</span>
                <span style={logValueStyle}>{log.kind}</span>
                <span style={logLabelStyle}>{t('logs.structural')}</span>
                <span style={logValueStyle}>{numberText(log.structural)}{log.hardBlock ? ' · ' + t('logs.hardBlock') : ''}</span>
                <span style={logLabelStyle}>{t('logs.malice')}</span>
                <span style={logValueStyle}>{numberText(log.malice)}{log.classifier === undefined ? '' : ' · ' + t('logs.classifier') + ' ' + numberText(log.classifier)}</span>
                <span style={logLabelStyle}>{t('logs.alignment')}</span>
                <span style={logValueStyle}>{log.alignment === undefined ? '—' : numberText(log.alignment)}</span>
                <span style={logLabelStyle}>{t('logs.duration')}</span>
                <span style={logValueStyle}>{typeof log.durationMs === 'number' ? String(Math.round(log.durationMs)) + ' ms' : '—'}</span>
              </div>
              )}
              {Array.isArray(log.reasons) && log.reasons.length > 0 ? (
                <div style={logSectionStyle}>
                  <span style={logKeyStyle}>{t('logs.reason')}</span>
                  <span style={logValueStyle}>{log.reasons.join(' · ')}</span>
                </div>
              ) : null}
              {typeof log.reason === 'string' && log.reason !== '' ? (
                <div style={logSectionStyle}>
                  <span style={logKeyStyle}>{t('logs.reason')}</span>
                  <span style={logValueStyle}>{log.reason}</span>
                </div>
              ) : null}
            </div>
          </details>
        )
      })}
      </div>
    </>
  )
}
