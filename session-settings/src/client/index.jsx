import { INJECT, NS, OVERLAY_ID, TRIGGER_ID } from './constants.js'
import { createSnapshotStore } from './lib/store.js'
import { EN, ZH } from './locale.js'
import SessionSettingsButton from './components/SessionSettingsButton.jsx'
import SessionSettingsOverlay from './components/SessionSettingsOverlay.jsx'

/** Session Settings — Client half. */
export default function createClient() {
  return { apply, inject: INJECT }
}

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'session-settings: dictionaries')

  const uiStore = createSnapshotStore({ open: false, sessionId: undefined })
  const open = (sessionId) => {
    if (typeof sessionId === 'string') uiStore.set({ open: true, sessionId })
  }
  const close = () => uiStore.set({ open: false, sessionId: undefined })

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: TRIGGER_ID,
    order: 30,
    locale: NS,
    inject: () => ({ open }),
  }, SessionSettingsButton))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: OVERLAY_ID,
    order: 100,
    locale: NS,
    inject: () => ({ uiStore, close }),
  }, SessionSettingsOverlay))
}
