import { useSnapshot } from '../lib/hooks.js'
import SessionSettingsDialog from './SessionSettingsDialog.jsx'

/** Root overlay entry: renders nothing until the header action opens it. */
export default function SessionSettingsOverlay(props) {
  const { uiStore, close, t } = props
  const ui = useSnapshot(uiStore)
  if (!ui.open || typeof ui.sessionId !== 'string') return null
  return <SessionSettingsDialog sessionId={ui.sessionId} t={t} onClose={close} />
}
