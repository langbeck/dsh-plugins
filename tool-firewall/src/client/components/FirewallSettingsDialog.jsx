import { useEffect, useRef, useState } from 'react'

import { LOGS_ROUTE } from '../constants.js'
import { useSnapshot } from '../lib/hooks.js'
import {
  dialogBackdropStyle,
  dialogBodyTabbedStyle,
  dialogCloseStyle,
  dialogHeaderStyle,
  dialogPanelStyle,
  dialogSubtitleStyle,
  dialogTitleStyle,
  copyButtonStyle,
  copyIconButtonStyle,
  inspectContentHeaderStyle,
  inspectHeaderStyle,
  inspectMetaLabelStyle,
  inspectMetaStyle,
  inspectMetaValueStyle,
  inspectUrlTextStyle,
  inspectUrlValueStyle,
  inspectPanelStyle,
  inspectPreStyle,
  inspectWarningStyle,
} from '../lib/styles.js'
import SettingsForm from './SettingsForm.jsx'

const SIZE_KEY = 'dsh-plugin-tool-firewall:dialog-size'

function readStoredSize() {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(SIZE_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const width = Number(parsed.width)
    const height = Number(parsed.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 420 || height < 280) return undefined
    return { width: Math.round(width), height: Math.round(height) }
  } catch (error) {
    return undefined
  }
}

function writeStoredSize(size) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SIZE_KEY, JSON.stringify(size))
  } catch (error) {}
}

function middleTruncate(value, limit = 88) {
  const text = String(value)
  if (text.length <= limit) return text
  const head = Math.ceil((limit - 1) * 0.62)
  const tail = limit - 1 - head
  return text.slice(0, head) + '…' + text.slice(-tail)
}

async function copyText(value) {
  try {
    if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch (error) {}
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch (error) {
    return false
  }
}

function CopyGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

function CopyButton({ value, t, iconOnly = false }) {
  const [status, setStatus] = useState('idle')
  const timerRef = useRef(undefined)
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const label = status === 'copied'
    ? t('logs.copied')
    : status === 'failed'
      ? t('logs.copyFailed')
      : t('logs.copy')
  async function copy() {
    const copied = await copyText(value)
    setStatus(copied ? 'copied' : 'failed')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setStatus('idle'), 1600)
  }
  return (
    <button
      type="button"
      style={iconOnly ? copyIconButtonStyle : copyButtonStyle}
      aria-label={label}
      title={label}
      aria-live="polite"
      onClick={copy}
    >
      {iconOnly ? (status === 'copied' ? '✓' : status === 'failed' ? '!' : <CopyGlyph />) : label}
    </button>
  )
}

/** Modal wrapper around the settings form with drag and persisted resize. */
export default function FirewallSettingsDialog(props) {
  const { uiStore, close, t, configForm } = props
  const ui = useSnapshot(uiStore)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [models, setModels] = useState(undefined)
  const [inspectLog, setInspectLog] = useState(null)
  const [size, setSize] = useState(readStoredSize)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const panelRef = useRef(null)
  const dragRef = useRef(undefined)

  useEffect(() => {
    if (!ui.open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (inspectLog !== null) setInspectLog(null)
        else close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.open, close, inspectLog])

  useEffect(() => {
    if (!ui.open) {
      setInspectLog(null)
      return undefined
    }
    setOffset({ x: 0, y: 0 })
    return undefined
  }, [ui.open])

  useEffect(() => {
    if (!ui.open || panelRef.current === null || typeof ResizeObserver === 'undefined') return undefined
    let saveTimer
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize
      const width = Math.round(box?.inlineSize ?? entry.contentRect.width)
      const height = Math.round(box?.blockSize ?? entry.contentRect.height)
      if (width <= 0 || height <= 0) return
      setSize((current) => current !== undefined && current.width === width && current.height === height ? current : { width, height })
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => writeStoredSize({ width, height }), 200)
    })
    observer.observe(panelRef.current)
    return () => {
      clearTimeout(saveTimer)
      observer.disconnect()
    }
  }, [ui.open])

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
          setModels(value.models ?? undefined)
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

  function startDrag(event) {
    if (event.button !== 0) return
    const target = event.target
    if (target !== null && target !== undefined && typeof target.closest === 'function' && target.closest('button') !== null) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
  }

  function moveDrag(event) {
    const drag = dragRef.current
    if (drag === undefined || drag.pointerId !== event.pointerId) return
    setOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
  }

  function endDrag(event) {
    const drag = dragRef.current
    if (drag === undefined || drag.pointerId !== event.pointerId) return
    dragRef.current = undefined
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch (error) {}
  }

  if (!ui.open) return null
  const panelStyle = {
    ...dialogPanelStyle,
    transform: `translate(${offset.x}px, ${offset.y}px)`,
  }
  if (size !== undefined) {
    panelStyle.width = String(size.width) + 'px'
    panelStyle.height = String(size.height) + 'px'
  }
  return (
    <>
      <div
        style={dialogBackdropStyle}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div ref={panelRef} style={panelStyle} role="dialog" aria-modal="true" aria-label={t('config.title')}>
          <div
            style={dialogHeaderStyle}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div style={{ minWidth: 0 }}>
              <h2 style={dialogTitleStyle}>{t('config.title')}</h2>
              <p style={dialogSubtitleStyle}>{t('config.summary')}</p>
            </div>
            <button type="button" style={dialogCloseStyle()} aria-label={t('dialog.close')} title={t('dialog.close')} onClick={close}>
              ×
            </button>
          </div>
          <div style={dialogBodyTabbedStyle}>
            <SettingsForm view="page" t={t} configForm={configForm} tabbed logs={logs} logsLoading={logsLoading} models={models} onInspect={setInspectLog} />
          </div>
        </div>
      </div>

      {inspectLog === null ? null : (
        <div
          style={{ ...dialogBackdropStyle, zIndex: 1200 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInspectLog(null)
          }}
        >
          <div style={inspectPanelStyle} role="dialog" aria-modal="true" aria-label={t('logs.inspectTitle')}>
            <div style={inspectHeaderStyle}>
              <div style={{ minWidth: 0 }}>
                <h2 style={dialogTitleStyle}>{t('logs.inspectTitle')}</h2>
                <p style={dialogSubtitleStyle}>
                  {inspectLog.tool} · {t('logs.outputScore')} {typeof inspectLog.outputScore === 'number' ? inspectLog.outputScore.toFixed(3) : '—'}
                </p>
              </div>
              <button
                type="button"
                style={dialogCloseStyle()}
                aria-label={t('dialog.close')}
                title={t('dialog.close')}
                onClick={() => setInspectLog(null)}
              >
                ×
              </button>
            </div>
            <p style={inspectWarningStyle}>{t('logs.inspectWarning')}</p>
            <div style={inspectMetaStyle}>
              {typeof inspectLog.outputUrl === 'string' && inspectLog.outputUrl !== '' ? (
                <>
                  <span style={inspectMetaLabelStyle}>{t('logs.inspectUrl')}</span>
                  <span style={inspectUrlValueStyle}>
                    <span style={inspectUrlTextStyle} title={inspectLog.outputUrl}>{middleTruncate(inspectLog.outputUrl)}</span>
                    <CopyButton value={inspectLog.outputUrl} t={t} />
                  </span>
                </>
              ) : null}
              {typeof inspectLog.outputStatus === 'number' ? (
                <>
                  <span style={inspectMetaLabelStyle}>{t('logs.inspectStatus')}</span>
                  <span style={inspectMetaValueStyle}>{String(inspectLog.outputStatus)}</span>
                </>
              ) : null}
              <span style={inspectMetaLabelStyle}>{t('logs.action')}</span>
              <span style={inspectMetaValueStyle}>
                {inspectLog.action === 'block' ? t('logs.blocked') : t('logs.quarantined')}
              </span>
              {inspectLog.outputTruncated === true ? (
                <>
                  <span style={inspectMetaLabelStyle}>{t('logs.inspectTruncated')}</span>
                  <span style={inspectMetaValueStyle}>{t('logs.yes')}</span>
                </>
              ) : null}
            </div>
            <div style={inspectContentHeaderStyle}>
              <span>{t('logs.inspectContent')}</span>
              {typeof inspectLog.outputContent === 'string' && inspectLog.outputContent !== ''
                ? <CopyButton value={inspectLog.outputContent} t={t} iconOnly />
                : null}
            </div>
            {/* Untrusted text is rendered as a React text node, never as HTML. */}
            <pre style={inspectPreStyle}>{typeof inspectLog.outputContent === 'string' ? inspectLog.outputContent : ''}</pre>
          </div>
        </div>
      )}
    </>
  )
}
