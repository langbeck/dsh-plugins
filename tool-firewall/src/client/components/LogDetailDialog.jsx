import CopyButton, { middleTruncate } from './CopyButton.jsx'
import {
  detailBodyStyle,
  detailMetaGridStyle,
  detailMetaStyle,
  detailReasonEmptyStyle,
  detailReasonListStyle,
  detailReasonStyle,
  detailSplitStyle,
  detailPreStyle,
  detailSectionHeaderStyle,
  detailSectionStyle,
  dialogBackdropStyle,
  dialogCloseStyle,
  dialogSubtitleStyle,
  dialogTitleStyle,
  inspectHeaderStyle,
  inspectMetaLabelStyle,
  inspectMetaValueStyle,
  inspectPanelStyle,
  inspectUrlTextStyle,
  inspectUrlValueStyle,
} from '../lib/styles.js'

function timeText(at) {
  if (typeof at !== 'number' || !Number.isFinite(at)) return ''
  return new Date(at).toLocaleString()
}

function numberText(value, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function MetaRow({ label, value }) {
  return (
    <>
      <span style={inspectMetaLabelStyle}>{label}</span>
      <span style={inspectMetaValueStyle}>{value}</span>
    </>
  )
}

function FlagList({ log, t }) {
  const flags = []
  if (log.bypass) flags.push(t('logs.bypass'))
  if (log.cached) flags.push(t('logs.cached'))
  if (log.semanticUnavailable) flags.push(t('logs.unavailable'))
  return flags.length === 0 ? null : (
    <>
      <span style={inspectMetaLabelStyle}>{t('logs.flags')}</span>
      <span style={inspectMetaValueStyle}>{flags.join(' · ')}</span>
    </>
  )
}

/** Human inspection dialog for one input or output firewall log row. */
export default function LogDetailDialog({ log, t, close }) {
  const isOutput = log.phase === 'output'
  const reasonParts = []
  if (Array.isArray(log.reasons)) reasonParts.push(...log.reasons)
  if (typeof log.reason === 'string' && log.reason !== '' && !reasonParts.includes(log.reason)) reasonParts.push(log.reason)
  const reasonText = reasonParts.length === 0 ? '—' : reasonParts.join('\n')
  const decision = isOutput
    ? (log.action === 'allow' ? t('logs.outputAllowed') : log.action === 'block' ? t('logs.blocked') : t('logs.quarantined'))
    : (log.blocked ? t('logs.blocked') : t('logs.allowed'))
  return (
    <div
      style={{ ...dialogBackdropStyle, zIndex: 1200 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div style={inspectPanelStyle} role="dialog" aria-modal="true" aria-label={isOutput ? t('logs.inspectOutputTitle') : t('logs.inspectInputTitle')}>
        <div style={inspectHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <h2 style={dialogTitleStyle}>{isOutput ? t('logs.inspectOutputTitle') : t('logs.inspectInputTitle')}</h2>
            <p style={dialogSubtitleStyle}>
              {log.tool} · {timeText(log.at)} · {decision}
            </p>
          </div>
          <button
            type="button"
            style={dialogCloseStyle()}
            aria-label={t('dialog.close')}
            title={t('dialog.close')}
            onClick={close}
          >
            ×
          </button>
        </div>

        <div style={detailBodyStyle}>
          {isOutput ? (
            <>
              <div style={detailMetaStyle}>
                {typeof log.outputUrl === 'string' && log.outputUrl !== '' ? (
                  <>
                    <span style={inspectMetaLabelStyle}>{t('logs.inspectUrl')}</span>
                    <span style={inspectUrlValueStyle}>
                      <span style={inspectUrlTextStyle} title={log.outputUrl}>{middleTruncate(log.outputUrl)}</span>
                      <CopyButton value={log.outputUrl} t={t} />
                    </span>
                  </>
                ) : null}
                {typeof log.outputStatus === 'number' ? <MetaRow label={t('logs.inspectStatus')} value={String(log.outputStatus)} /> : null}
                <MetaRow label={t('logs.action')} value={decision} />
                <MetaRow label={t('logs.outputScore')} value={numberText(log.outputScore)} />
                {typeof log.outputThreshold === 'number' ? <MetaRow label={t('logs.threshold')} value={numberText(log.outputThreshold)} /> : null}
                <MetaRow label={t('logs.chunks')} value={String(log.chunks ?? 0) + (log.truncated ? ' · truncated' : '')} />
                {log.outputTruncated === true ? <MetaRow label={t('logs.inspectTruncated')} value={t('logs.yes')} /> : null}
              </div>
              <div style={detailSectionHeaderStyle}>
                <span>{t('logs.inspectContent')}</span>
                {typeof log.outputContent === 'string' && log.outputContent !== ''
                  ? <CopyButton value={log.outputContent} t={t} iconOnly />
                  : null}
              </div>
              {/* Untrusted text is rendered as a React text node, never as HTML. */}
              <pre style={detailPreStyle}>{typeof log.outputContent === 'string' ? log.outputContent : ''}</pre>
              {typeof log.reason === 'string' && log.reason !== '' ? (
                <div style={detailReasonStyle}>
                  <div style={detailSectionHeaderStyle}>
                    <span>{t('logs.reason')}</span>
                    <CopyButton value={log.reason} t={t} iconOnly />
                  </div>
                  <pre style={detailPreStyle}>{log.reason}</pre>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {typeof log.description === 'string' && log.description !== '' ? (
                <>
                  <div style={detailSectionHeaderStyle}>
                    <span>{t('logs.description')}</span>
                    <CopyButton value={log.description} t={t} iconOnly />
                  </div>
                  <pre style={detailPreStyle}>{log.description}</pre>
                </>
              ) : null}
              <div style={detailSectionHeaderStyle}>
                <span>{t('logs.command')}</span>
                {typeof log.command === 'string' && log.command !== ''
                  ? <CopyButton value={log.command} t={t} iconOnly />
                  : null}
              </div>
              <pre style={detailPreStyle}>{typeof log.command === 'string' && log.command !== '' ? log.command : t('logs.noCommand')}</pre>
              <div style={detailSplitStyle}>
                <div style={detailMetaGridStyle}>
                  <MetaRow label={t('logs.result')} value={decision + (log.code === undefined ? '' : ' · ' + log.code)} />
                  <MetaRow label={t('logs.kind')} value={log.kind ?? '—'} />
                  <MetaRow label={t('logs.structural')} value={numberText(log.structural) + (log.hardBlock ? ' · ' + t('logs.hardBlock') : '')} />
                  <MetaRow label={t('logs.malice')} value={numberText(log.malice) + (log.classifier === undefined ? '' : ' · ' + t('logs.classifier') + ' ' + numberText(log.classifier))} />
                  <MetaRow label={t('logs.alignment')} value={log.alignment === undefined ? '—' : numberText(log.alignment)} />
                  <MetaRow label={t('logs.duration')} value={typeof log.durationMs === 'number' ? String(Math.round(log.durationMs)) + ' ms' : '—'} />
                  <FlagList log={log} t={t} />
                </div>
                <div style={detailReasonStyle}>
                  <div style={detailSectionHeaderStyle}>
                    <span>{t('logs.reasons')}</span>
                    {reasonText !== '—' ? <CopyButton value={reasonText} t={t} iconOnly /> : null}
                  </div>
                  {reasonParts.length === 0
                    ? <span style={detailReasonEmptyStyle}>—</span>
                    : <ul style={detailReasonListStyle}>{reasonParts.map((reason, index) => <li key={String(index) + ':' + reason}>{reason}</li>)}</ul>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
