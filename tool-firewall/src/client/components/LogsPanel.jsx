import {
  errorStyle,
  logDecisionStyle,
  logEntryStyle,
  logMutedStyle,
  logSummaryStyle,
  logTimeStyle,
  logToolStyle,
  logsListStyle,
} from '../lib/styles.js'

function timeText(at) {
  if (typeof at !== 'number' || !Number.isFinite(at)) return ''
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Recent interceptions, one row per call; clicking a row opens its details. */
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
            <button
              key={log.id}
              type="button"
              aria-label={t('logs.inspect')}
              title={t('logs.inspect')}
              style={{
                ...logEntryStyle,
                display: 'block',
                width: '100%',
                padding: 0,
                textAlign: 'left',
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
              }}
              onClick={() => onInspect(log)}
            >
              <span style={logSummaryStyle}>
                <span style={logTimeStyle}>{timeText(log.at)}</span>
                <span style={logToolStyle}>{log.tool}</span>
                {flags.length === 0 ? null : <span style={logMutedStyle}>{flags.join(' · ')}</span>}
                <span style={logDecisionStyle(log.blocked)}>{t(decisionLabel)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
