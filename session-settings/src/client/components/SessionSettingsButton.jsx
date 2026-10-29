import { triggerStyle } from '../lib/styles.js'

/** Compact header action that opens the Session Settings dialog. */
export default function SessionSettingsButton(props) {
  const { sessionId, open, t } = props
  const label = t('button.label')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={triggerStyle()}
      onClick={() => open(sessionId)}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="6" r="1.8" fill="var(--dsw-alias-bg-layer-1)" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13" cy="10" r="1.8" fill="var(--dsw-alias-bg-layer-1)" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8.5" cy="14" r="1.8" fill="var(--dsw-alias-bg-layer-1)" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  )
}
