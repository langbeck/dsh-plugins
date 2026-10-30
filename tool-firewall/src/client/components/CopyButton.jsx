import { useEffect, useRef, useState } from 'react'

import { copyButtonStyle, copyIconButtonStyle } from '../lib/styles.js'

export function middleTruncate(value, limit = 88) {
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

export default function CopyButton({ value, t, iconOnly = false }) {
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
