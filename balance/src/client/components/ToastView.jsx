import { useEffect, useLayoutEffect, useState } from 'react'

import { useSnapshot } from '../lib/hooks.js'

const toastStyle = (visible, position) => ({
  position: 'fixed',
  left: position === undefined ? '50%' : String(position.left) + 'px',
  bottom: position === undefined ? '104px' : String(position.bottom) + 'px',
  zIndex: 1300,
  maxWidth: 'min(520px, calc(100vw - 32px))',
  padding: '8px 14px',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-lg, 12px)',
  background: 'var(--dsw-alias-bg-layer-3)',
  color: 'var(--dsw-alias-label-primary)',
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.32)',
  fontSize: '12px',
  lineHeight: '18px',
  textAlign: 'center',
  pointerEvents: 'none',
  transform: position === undefined ? 'translateX(-50%)' : 'none',
  opacity: visible ? 1 : 0,
  transition: 'opacity 300ms ease',
})

/** Transient status toast for Budget command submissions. */
export default function ToastView({ toastStore }) {
  const toast = useSnapshot(toastStore)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState(undefined)

  useLayoutEffect(() => {
    if (toast.text === '' || typeof document === 'undefined') return undefined
    const update = () => {
      const composer = document.querySelector('[data-composer-overlay]')
      if (composer === null) return
      const rect = composer.getBoundingClientRect()
      setPosition({ left: Math.max(8, Math.round(rect.left)), bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 6)) })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [toast.id, toast.text])

  useEffect(() => {
    if (toast.id === 0 || toast.text === '') return undefined
    setVisible(true)
    const fade = setTimeout(() => setVisible(false), 2400)
    const clear = setTimeout(() => toastStore.set({ id: 0, text: '', error: false }), 2800)
    return () => {
      clearTimeout(fade)
      clearTimeout(clear)
    }
  }, [toast.id, toast.text, toastStore])

  if (toast.text === '') return null
  return (
    <div role="status" aria-live="polite" style={toastStyle(visible, position)}>
      {toast.error ? '⚠ ' : ''}{toast.text}
    </div>
  )
}
