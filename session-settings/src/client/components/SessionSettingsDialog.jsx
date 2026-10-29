import { useEffect, useMemo, useState } from 'react'

import { readSettings, applyPreset, saveBlockList } from '../lib/api.js'
import {
  backdropStyle,
  bodyStyle,
  codeBlockStyle,
  dangerButtonStyle,
  emptyStyle,
  errorStyle,
  fieldStyle,
  footerStyle,
  headerStyle,
  hintStyle,
  inputStyle,
  itemDescriptionStyle,
  itemHeaderStyle,
  labelStyle,
  listItemStyle,
  metaBadgeStyle,
  monoNameStyle,
  panelStyle,
  policyButtonStyle,
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
  tabBarStyle,
  tabStyle,
  titleStyle,
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

  const tools = useMemo(() => {
    if (snapshot === undefined) return []
    const needle = search.trim().toLowerCase()
    if (needle === '') return snapshot.tools
    return snapshot.tools.filter((tool) => tool.name.toLowerCase().includes(needle) || tool.description.toLowerCase().includes(needle))
  }, [snapshot, search])

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
                  search={search}
                  setSearch={setSearch}
                  tools={tools}
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
  const { snapshot, t, busy, search, setSearch, tools, expanded, setExpanded, onPolicy } = props
  const visibleNames = new Set(snapshot.tools.map((tool) => tool.name))
  const hiddenBlocked = snapshot.blockList.session.filter((name) => !visibleNames.has(name))
  return (
    <div style={sectionStyle}>
      <p style={hintStyle}>{t('settings.allowListHint')}</p>
      <p style={warningStyle}>{t('settings.allowListWarning')}</p>
      <p style={hintStyle}>{t('tools.policyHint')}</p>
      <input
        type="search"
        value={search}
        placeholder={t('tools.search')}
        aria-label={t('tools.search')}
        style={{ ...inputStyle(), width: '100%' }}
        onChange={(event) => setSearch(event.target.value)}
      />
      {tools.length === 0 ? <p style={emptyStyle}>{t('tools.empty')}</p> : tools.map((tool) => {
        const open = expanded === 'tool:' + tool.name
        const blocked = snapshot.blockList.session.includes(tool.name)
        return (
          <div key={tool.name} style={listItemStyle(open)}>
            <button type="button" style={itemHeaderStyle} onClick={() => setExpanded(open ? '' : 'tool:' + tool.name)}>
              <span style={monoNameStyle}>{tool.name}</span>
              {tool.deferLoading ? <span style={metaBadgeStyle}>{t('tools.deferLoading')}</span> : null}
              <span style={itemDescriptionStyle}>{tool.description}</span>
            </button>
            <div style={rowStyle}>
              <button
                type="button"
                style={policyButtonStyle(blocked, 'block')}
                disabled={busy}
                onClick={() => onPolicy(tool.name)}
              >
                {blocked ? t('tools.blocked') : t('tools.block')}
              </button>
            </div>
            {open ? (
              <div style={sectionStyle}>
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
      {hiddenBlocked.length === 0 ? null : (
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>{t('tools.controlled')}</h3>
          {hiddenBlocked.map((name) => (
            <div key={name} style={rowStyle}>
              <span style={monoNameStyle}>{name}</span>
              <button type="button" style={policyButtonStyle(true, 'block')} disabled={busy} onClick={() => onPolicy(name)}>
                {t('tools.unblock')}
              </button>
            </div>
          ))}
        </section>
      )}
      <p style={hintStyle}>{t('settings.memoryWarning')}</p>
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
