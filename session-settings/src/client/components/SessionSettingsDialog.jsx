import { useEffect, useMemo, useState } from 'react'

import { readSettings, applyPreset, saveBlockList } from '../lib/api.js'
import {
  backdropStyle,
  bodyStyle,
  codeBlockStyle,
  dangerButtonStyle,
  disabledLineStyle,
  emptyStyle,
  errorStyle,
  fieldStyle,
  footerStyle,
  headerStyle,
  hintStyle,
  inputStyle,
  itemDescriptionStyle,
  labelStyle,
  listItemStyle,
  metaBadgeStyle,
  monoNameStyle,
  panelStyle,
  presetDescriptionStyle,
  presetNameStyle,
  presetOptionStyle,
  presetRowStyle,
  primaryButtonStyle,
  rowStyle,
  secondaryButtonStyle,
  sectionStyle,
  sectionTitleStyle,
  subtitleStyle,
  switchKnobStyle,
  switchTrackStyle,
  tabBarStyle,
  tabStyle,
  titleStyle,
  toolArtworkStyle,
  toolBodyButtonStyle,
  toolBodyStyle,
  toolDescriptionStyle,
  toolDetailsStyle,
  toolItemStyle,
  toolListStyle,
  toolNameStyle,
  toolRowStyle,
  warningStyle,
} from '../lib/styles.js'

const TABS = ['settings', 'tools', 'commands']

const PRESET_LABELS = {
  'read-only': 'preset.readOnly',
  'workspace-write': 'preset.workspaceWrite',
  'danger-full-access': 'preset.fullAccess',
}

/** The tabbed Session Settings dialog. Read-only inspection plus preset and tool-policy writes. */
export default function SessionSettingsDialog(props) {
  const { sessionId, t, onClose } = props
  const [tab, setTab] = useState('settings')
  const [status, setStatus] = useState('loading')
  const [snapshot, setSnapshot] = useState(undefined)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState('')
  const [pendingPreset, setPendingPreset] = useState('')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError('')
    readSettings(sessionId)
      .then((value) => {
        if (cancelled) return
        setSnapshot(value)
        setStatus('ready')
      })
      .catch((failure) => {
        if (cancelled) return
        setError(failure instanceof Error ? failure.message : String(failure))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && pendingPreset === '') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pendingPreset])

  async function reload() {
    setBusy(true)
    setActionError('')
    try {
      const value = await readSettings(sessionId)
      setSnapshot(value)
      setStatus('ready')
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  async function changePreset(next) {
    setBusy(true)
    setActionError('')
    setPendingPreset('')
    try {
      const value = await applyPreset(sessionId, next)
      setSnapshot(value)
    } catch (failure) {
      setActionError(t('error.preset'))
    } finally {
      setBusy(false)
    }
  }

  async function changeBlockList(block) {
    setBusy(true)
    setActionError('')
    try {
      const value = await saveBlockList(sessionId, block)
      setSnapshot(value)
    } catch (failure) {
      setActionError(t('settings.saveError'))
    } finally {
      setBusy(false)
    }
  }

  function setToolPolicy(name) {
    if (snapshot === undefined || busy) return
    const block = new Set(snapshot.blockList.session)
    if (block.has(name)) block.delete(name)
    else block.add(name)
    void changeBlockList(Array.from(block))
  }

  const commands = useMemo(() => {
    if (snapshot === undefined) return []
    const needle = search.trim().toLowerCase()
    if (needle === '') return snapshot.commands
    return snapshot.commands.filter((command) => command.name.toLowerCase().includes(needle) || command.description.toLowerCase().includes(needle))
  }, [snapshot, search])

  return (
    <div
      style={backdropStyle}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('dialog.title')}
        style={panelStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={headerStyle}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h2 style={titleStyle}>{t('dialog.title')}</h2>
            <p style={subtitleStyle}>{t('dialog.subtitle')}</p>
          </div>
          <button type="button" aria-label={t('common.close')} title={t('common.close')} style={secondaryButtonStyle(false)} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <div role="tablist" style={tabBarStyle}>
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              style={tabStyle(tab === name)}
              onClick={() => {
                setTab(name)
                setSearch('')
                setExpanded('')
              }}
            >
              {t('tab.' + name)}
            </button>
          ))}
        </div>

        <div style={bodyStyle}>
          {status === 'loading' ? <p style={hintStyle}>{t('common.loading')}</p> : null}
          {status === 'error' ? (
            <div style={sectionStyle}>
              <p style={errorStyle}>{error === '' ? t('error.load') : error}</p>
              <div style={rowStyle}>
                <button type="button" style={primaryButtonStyle(false)} onClick={() => void reload()}>
                  {t('common.retry')}
                </button>
              </div>
            </div>
          ) : null}
          {status === 'ready' && snapshot !== undefined ? (
            <div>
              {actionError === '' ? null : <p style={errorStyle}>{actionError}</p>}
              {tab === 'settings' ? (
                <SettingsTab
                  snapshot={snapshot}
                  t={t}
                  busy={busy}
                  pendingPreset={pendingPreset}
                  setPendingPreset={setPendingPreset}
                  changePreset={changePreset}
                />
              ) : null}
              {tab === 'tools' ? (
                <ToolsTab
                  snapshot={snapshot}
                  t={t}
                  busy={busy}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onPolicy={setToolPolicy}
                />
              ) : null}
              {tab === 'commands' ? (
                <CommandsTab snapshot={snapshot} t={t} search={search} setSearch={setSearch} commands={commands} />
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={footerStyle}>
          <span style={hintStyle}>{snapshot !== undefined && snapshot.live === false ? t('settings.readOnlySession') : ''}</span>
          <div style={rowStyle}>
            <button type="button" style={secondaryButtonStyle(busy || status !== 'ready')} disabled={busy || status !== 'ready'} onClick={() => void reload()}>
              {t('common.refresh')}
            </button>
            <button type="button" style={primaryButtonStyle(false)} onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsTab(props) {
  const { snapshot, t, busy, pendingPreset, setPendingPreset, changePreset } = props
  const catalog = snapshot.preset.catalog
  return (
    <div>
      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t('settings.permissions')}</h3>
        <div style={fieldStyle}>
          <span style={labelStyle}>{t('settings.preset')}</span>
          <div style={presetRowStyle}>
            {catalog.map((option) => {
              const dangerous = option.value === 'danger-full-access'
              const selected = snapshot.preset.current === option.value
              const label = PRESET_LABELS[option.value] === undefined ? option.name : t(PRESET_LABELS[option.value])
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy}
                  title={option.description}
                  style={presetOptionStyle(selected, dangerous)}
                  onClick={() => {
                    if (option.value === snapshot.preset.current) return
                    if (dangerous) setPendingPreset(option.value)
                    else void changePreset(option.value)
                  }}
                >
                  <span style={presetNameStyle}>{label}</span>
                  {option.description === undefined || option.description === '' ? null : (
                    <span style={dangerous ? { ...presetDescriptionStyle, color: 'var(--dsw-alias-state-error-primary, #d93025)' } : presetDescriptionStyle}>{option.description}</span>
                  )}
                </button>
              )
            })}
          </div>
          {snapshot.preset.current === 'custom' ? <p style={hintStyle}>{t('settings.custom')}</p> : null}
        </div>

        {pendingPreset === 'danger-full-access' ? (
          <div style={sectionStyle}>
            <p style={warningStyle}>{t('settings.fullAccessWarning')}</p>
            <div style={rowStyle}>
              <button type="button" style={dangerButtonStyle(busy)} disabled={busy} onClick={() => void changePreset('danger-full-access')}>
                {t('settings.confirmFullAccess')}
              </button>
              <button type="button" style={secondaryButtonStyle(busy)} disabled={busy} onClick={() => setPendingPreset('')}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        <div style={rowStyle}>
          <span style={labelStyle}>{t('settings.effective')}</span>
          <span style={metaBadgeStyle}>{t('settings.sandbox')}: {snapshot.knobs.sandbox ?? '—'}</span>
          <span style={metaBadgeStyle}>{t('settings.approval')}: {snapshot.knobs.approval ?? '—'}</span>
        </div>
      </section>
    </div>
  )
}

function ToolsTab(props) {
  const { snapshot, t, busy, expanded, setExpanded, onPolicy } = props
  const blocked = snapshot.blockList.session
  return (
    <div>
      <p style={disabledLineStyle}>
        <span>{t('tools.disabled')}</span>
        <span>{blocked.length === 0 ? t('tools.none') : blocked.join(', ')}</span>
      </p>
      <div style={toolListStyle}>
        {snapshot.tools.length === 0 ? <p style={emptyStyle}>{t('tools.empty')}</p> : snapshot.tools.map((tool) => {
          const isBlocked = blocked.includes(tool.name)
          const open = expanded === tool.name
          const label = isBlocked ? t('tools.unblockTool', { name: tool.name }) : t('tools.blockTool', { name: tool.name })
          return (
            <div key={tool.name} style={toolItemStyle}>
              <div style={toolRowStyle}>
                <button
                  type="button"
                  aria-expanded={open}
                  style={toolBodyButtonStyle}
                  onClick={() => setExpanded(open ? '' : tool.name)}
                >
                  <ToolArtwork name={tool.name} />
                  <div style={toolBodyStyle}>
                    <span style={toolNameStyle}>{tool.name}</span>
                    <span style={toolDescriptionStyle}>{tool.description}</span>
                  </div>
                  <span style={{ flex: 'none', display: 'inline-flex', color: 'var(--dsw-alias-label-tertiary)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms ease' }} aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
                      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!isBlocked}
                  aria-label={label}
                  title={label}
                  disabled={busy}
                  style={switchTrackStyle(!isBlocked, busy)}
                  onClick={() => onPolicy(tool.name)}
                >
                  <span style={switchKnobStyle(!isBlocked)} />
                </button>
              </div>
              {open ? (
                <div style={toolDetailsStyle}>
                  <p style={hintStyle}>{tool.description}</p>
                  <span style={labelStyle}>{t('tools.parameters')}</span>
                  <pre style={codeBlockStyle}>{schemaText(tool.parameters)}</pre>
                  <span style={labelStyle}>{t('tools.recentCalls')}</span>
                  {tool.recentCalls.length === 0 ? <p style={hintStyle}>{t('tools.noRecentCalls')}</p> : tool.recentCalls.map((call) => (
                    <div key={call.callId} style={sectionStyle}>
                      <div style={rowStyle}>
                        <span style={metaBadgeStyle}>{call.status}</span>
                        <span style={hintStyle}>turn {call.turn} · step {call.step}</span>
                      </div>
                      <span style={labelStyle}>{t('tools.arguments')}</span>
                      <pre style={codeBlockStyle}>{call.arguments}</pre>
                      {call.result === '' || call.result === undefined ? null : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={labelStyle}>{t('tools.result')}</span>
                          <pre style={codeBlockStyle}>{call.result}</pre>
                        </div>
                      )}
                      {call.error === undefined ? null : <p style={errorStyle}>{t('tools.error')}: {call.error.code} {call.error.reason ?? ''}</p>}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}


const TOOL_ARTWORK_COLORS = ['#4d6bfe', '#2ea043', '#b7791f', '#8250df', '#1f6feb', '#c2414b']

function ToolArtwork({ name }) {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  const background = TOOL_ARTWORK_COLORS[hash % TOOL_ARTWORK_COLORS.length]
  return (
    <div style={{ ...toolArtworkStyle, background }} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="20" height="20" focusable="false">
        <path
          d="M11.2 3.1a4.3 4.3 0 0 0-5.3 5.2L2.8 11.4l2.3 2.3 3.1-3.1a4.3 4.3 0 0 0 5.2-5.3l-2.2 2.2-1.7-1.7 1.7-2.7Z"
          fill="currentColor"
        />
      </svg>
    </div>
  )
}

function CommandsTab(props) {
  const { t, search, setSearch, commands } = props
  return (
    <div style={sectionStyle}>
      <input
        type="search"
        value={search}
        placeholder={t('commands.search')}
        aria-label={t('commands.search')}
        style={{ ...inputStyle(), width: '100%' }}
        onChange={(event) => setSearch(event.target.value)}
      />
      {commands.length === 0 ? <p style={emptyStyle}>{t('commands.empty')}</p> : commands.map((command) => (
        <div key={command.name} style={listItemStyle(false)}>
          <span style={monoNameStyle}>/{command.name}</span>
          <span style={itemDescriptionStyle}>{command.description}</span>
          {command.inputHint === undefined ? null : <span style={hintStyle}>{t('commands.inputHint')}: {command.inputHint}</span>}
          {command.acceptsAttachments ? <span style={metaBadgeStyle}>{t('commands.attachments')}</span> : null}
        </div>
      ))}
    </div>
  )
}

function schemaText(schema) {
  try {
    return JSON.stringify(schema, null, 2)
  } catch (error) {
    return String(schema)
  }
}
