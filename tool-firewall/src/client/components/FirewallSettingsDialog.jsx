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
  inspectHeaderStyle,
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
            <pre style={inspectPreStyle}>{inspectLog.outputExcerpt ?? ''}</pre>
          </div>
        </div>
      )}
    </>
  )
}
