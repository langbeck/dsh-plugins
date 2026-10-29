import {
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
  const { logs = [], loading = false, t } = props
  if (loading && logs.length === 0) return <p style={logMutedStyle}>{t('logs.loading')}</p>
  if (logs.length === 0) return <p style={logMutedStyle}>{t('logs.empty')}</p>
  return (
    <div style={logsListStyle}>
      {logs.map((log) => {
        const flags = []
        if (log.bypass) flags.push(t('logs.bypass'))
        if (log.cached) flags.push(t('logs.cached'))
        if (log.semanticUnavailable) flags.push(t('logs.unavailable'))
        return (
          <details key={log.id} style={logEntryStyle}>
            <summary style={logSummaryStyle}>
              <span style={logTimeStyle}>{timeText(log.at)}</span>
              <span style={logToolStyle}>{log.tool}</span>
              {flags.length === 0 ? null : <span style={logMutedStyle}>{flags.join(' · ')}</span>}
              <span style={logDecisionStyle(log.blocked)}>{t(log.blocked ? 'logs.blocked' : 'logs.allowed')}</span>
            </summary>
            <div style={logBodyStyle}>
              <div style={logSectionStyle}>
                <span style={logKeyStyle}>{t('logs.command')}</span>
                <pre style={logPreStyle}>{log.command === '' ? t('logs.noCommand') : log.command}</pre>
              </div>
              {typeof log.description === 'string' && log.description !== '' ? (
                <div style={logSectionStyle}>
                  <span style={logKeyStyle}>{t('logs.description')}</span>
                  <pre style={logPreStyle}>{log.description}</pre>
                </div>
              ) : null}
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
  )
}
