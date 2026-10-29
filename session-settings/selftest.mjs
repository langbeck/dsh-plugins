/**
 * Session Settings selftest.
 *
 * Host snapshot helpers are imported directly; the generated Client bundle is
 * executed with a fake React surface to verify registration and the trigger.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import * as host from './src/index.js'
import { commandView, foldRecentToolCalls, mergeToolHistory, toolView } from './src/tools.js'
import { EN, ZH } from './src/client/locale.js'
import { disabledLineStyle, presetOptionStyle, presetRowStyle, switchKnobStyle, switchTrackStyle, toolRowStyle } from './src/client/lib/styles.js'

const here = dirname(fileURLToPath(import.meta.url))
let checks = 0
let failed = 0
function check(ok, label) {
  checks += 1
  if (!ok) failed += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + label)
}
function equal(actual, expected, label) {
  check(Object.is(actual, expected), label + ' (got ' + JSON.stringify(actual) + ')')
}

// ---------------------------------------------------------------------------
// Host helpers
// ---------------------------------------------------------------------------

const merged = mergeToolHistory({
  tools: [
    { name: 'read_file', description: 'Read', parameters: { type: 'object' } },
    { name: 'run_code', description: 'Run', parameters: {} },
  ],
  updates: [{ additions: [{ name: 'read_file', description: 'Read v2', parameters: {} }, { name: 'plugin_manager', description: 'Plugins', parameters: {} }] }],
})
equal(merged.length, 3, 'mergeToolHistory merges base tools and additions')
equal(merged.find((tool) => tool.name === 'read_file').description, 'Read v2', 'mergeToolHistory lets a later addition replace a base declaration')

const view = toolView({ name: 'read_file', description: 'Read', deferLoading: true, parameters: { type: 'object' } })
equal(view.name, 'read_file', 'toolView keeps the name')
equal(view.deferLoading, true, 'toolView keeps deferred loading')
equal(typeof view.parameters, 'object', 'toolView keeps the parameter schema')

const command = commandView({ name: 'compact', description: 'Compact', input: { hint: '<instructions>', attachments: true } })
equal(command.inputHint, '<instructions>', 'commandView keeps the input hint')
equal(command.acceptsAttachments, true, 'commandView keeps attachment support')

const events = [
  { type: 'tool/call', seq: 1, time: 10, data: { callId: 'a', name: 'read_file', arguments: '{"path":"x"}', turn: 1, step: 1 } },
  { type: 'tool/result', seq: 2, time: 20, data: { callId: 'a', message: { content: [{ type: 'text', text: 'content' }] } } },
  { type: 'tool/call', seq: 3, time: 30, data: { callId: 'b', name: 'plugin_manager', arguments: '{}', turn: 1, step: 2 } },
]
const calls = foldRecentToolCalls(events, 0, 8)
equal(calls.length, 2, 'foldRecentToolCalls keeps both calls')
equal(calls[0].callId, 'b', 'foldRecentToolCalls returns newest first')
equal(calls[1].result, 'content', 'foldRecentToolCalls attaches result text')
const inherited = foldRecentToolCalls(events, 2, 8)
equal(inherited.length, 1, 'foldRecentToolCalls skips inherited events')
equal(inherited[0].callId, 'b', 'foldRecentToolCalls keeps own events after the inherited prefix')

equal(host.sanitizeTools([' plugin_manager ', 'plugin_manager', '', 7, 'read_file']).join(','), 'plugin_manager,read_file', 'sanitizeTools trims and dedupes strings')
equal(host.sanitizeTools('plugin_manager').length, 0, 'sanitizeTools rejects a non-array')
const longName = 'x'.repeat(129)
equal(host.sanitizeTools([longName]).length, 0, 'sanitizeTools rejects overlong names')

for (const service of ['connection', 'approval', 'permissionPresets', 'sandboxPolicy', 'commands', 'agents', 'sessions']) {
  check(host.inject.includes(service), 'inject includes ' + service)
}

// ---------------------------------------------------------------------------
// Host route and approval allow-list end to end
// ---------------------------------------------------------------------------

const session = {
  id: 'session-1',
  inheritedEventCount: 0,
  requestHeader: () => ({ tools: [{ name: 'plugin_manager', description: 'Plugins', parameters: { type: 'object' } }] }),
  toolHistory: () => ({ tools: [], updates: [] }),
}
let routeHandler
let approvalHandler
let selectedPreset
const fakeHost = {
  effect: (callback) => callback(),
  on: (event, listener) => {
    if (event === 'approval/request') approvalHandler = listener
    return () => {}
  },
  connection: { fetch: { register: (route) => { routeHandler = route.fetch; return () => {} } } },
  get: (name) => name === 'sessionQuery' ? {
    observeSession: async () => ({
      events: [
        { type: 'tool/call', seq: 1, time: 1, data: { callId: 'call-1', name: 'plugin_manager', arguments: '{}', turn: 1, step: 1 } },
        { type: 'tool/result', seq: 2, time: 2, data: { callId: 'call-1', message: { content: [{ type: 'text', text: 'ok' }] } } },
      ],
      [Symbol.dispose]() {},
    }),
  } : undefined,
  sessions: { get: (id) => id === 'session-1' ? session : undefined },
  agents: { get: (id) => id === 'session-1' ? { id: 'session-1' } : undefined },
  commands: { list: () => [{ name: 'compact', description: 'Compact', input: { hint: '<instructions>' } }] },
  permissionPresets: {
    catalog: () => ({ options: [{ value: 'workspace-write', name: 'Workspace Write' }, { value: 'danger-full-access', name: 'Full Access' }] }),
    current: () => selectedPreset ?? 'workspace-write',
    set: (_session, name) => { selectedPreset = name },
  },
  sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
  approval: { overrideOf: () => 'ask' },
}
const hostPlugin = await import('./src/index.js')
hostPlugin.apply(fakeHost, { defaultAllowedTools: [] })
check(typeof routeHandler === 'function', 'Host registers the settings route')
check(typeof approvalHandler === 'function', 'Host registers the approval answerer')

async function callHost(body) {
  const response = await routeHandler({ json: async () => body })
  return response.json()
}
const readValue = await callHost({ sessionId: 'session-1', action: 'read' })
check(readValue.ok === true, 'read returns ok')
equal(readValue.value.tools[0].name, 'plugin_manager', 'read exposes the Session tool schema')
equal(readValue.value.tools[0].recentCalls[0].result, 'ok', 'read attaches recent tool calls')
equal(readValue.value.commands[0].name, 'compact', 'read exposes Host commands')
equal(readValue.value.knobs.sandbox, 'workspace-write', 'read exposes the effective sandbox')
equal(readValue.value.blockList.session.length, 0, 'read starts with an empty block list')
equal(readValue.value.defaultPolicy, 'allow', 'read reports the default allow policy')
const badPreset = await callHost({ sessionId: 'session-1', action: 'preset', preset: 'nope' })
check(badPreset.ok === false, 'unknown presets are rejected')
const presetValue = await callHost({ sessionId: 'session-1', action: 'preset', preset: 'danger-full-access' })
check(presetValue.ok === true, 'a configured preset is accepted')
equal(selectedPreset, 'danger-full-access', 'the preset service receives the selection')
const policiesValue = await callHost({ sessionId: 'session-1', action: 'policies', block: ['read_file'] })
check(policiesValue.ok === true, 'tool-policy write returns ok')
equal(policiesValue.value.blockList.session.join(','), 'read_file', 'block list persists in memory')
const blocked = await approvalHandler({ toolName: 'read_file', agent: { id: 'session-1' } }, async () => 'rejected')
equal(blocked, 'rejected', 'blocked tool approvals resolve rejected')
const defaultAllowed = await approvalHandler({ toolName: 'plugin_manager', agent: { id: 'session-1' } }, async () => 'rejected')
equal(defaultAllowed, 'allowed-once', 'non-blocked tool approvals resolve allowed-once by default')
const bashAllowed = await approvalHandler({ toolName: 'bash', agent: { id: 'session-1' } }, async () => 'rejected')
equal(bashAllowed, 'allowed-once', 'unlisted tools are allowed by default')
const resetValue = await callHost({ sessionId: 'session-1', action: 'policies', block: [] })
equal(resetValue.value.blockList.session.length, 0, 'an empty block list resets the control')

// ---------------------------------------------------------------------------
// Presentation requirements
// ---------------------------------------------------------------------------

equal(EN['preset.readOnly'], 'Read only', 'English friendly name for Read only')
equal(EN['preset.workspaceWrite'], 'Workspace write', 'English friendly name for Workspace write')
equal(EN['preset.fullAccess'], 'Full access', 'English friendly name for Full access')
equal(ZH['preset.fullAccess'], '完全访问', 'Chinese friendly name for Full access')
equal(presetRowStyle.flexDirection, 'row', 'preset options are laid out in one row')
equal(presetRowStyle.flexWrap, 'nowrap', 'preset options stay side by side')
const dangerousStyle = presetOptionStyle(false, true)
check(String(dangerousStyle.color).includes('state-error'), 'Full access uses the error color for its font')
check(String(dangerousStyle.border).includes('state-error'), 'Full access uses the error color for its border')
equal(toolRowStyle.display, 'flex', 'tools render as plugin-style rows')
const enabledSwitch = switchTrackStyle(true, false)
const blockedSwitch = switchTrackStyle(false, false)
check(enabledSwitch.background !== blockedSwitch.background, 'enabled and blocked switches use different tracks')
check(String(enabledSwitch.background).includes('brand'), 'enabled switch uses the brand color')
check(String(switchKnobStyle(true).background).includes('state-success'), 'enabled switch knob is green')
check(String(switchKnobStyle(false).background).includes('state-error'), 'blocked switch knob is red')
equal(disabledLineStyle.display, 'flex', 'disabled-tools summary is a line')
equal(EN['tools.disabled'], 'Disabled tools:', 'disabled-tools line has friendly copy')
equal(ZH['tools.disabled'], '已禁用的工具：', 'disabled-tools line is localized')

const dialogSource = readFileSync(join(here, 'src', 'client', 'components', 'SessionSettingsDialog.jsx'), 'utf8')
const importedStyles = new Set(
  (/import \{([^}]*)\} from '\.\.\/lib\/styles\.js'/.exec(dialogSource)?.[1] ?? '')
    .split(',').map((name) => name.trim()).filter(Boolean),
)
const usedStyles = new Set(Array.from(dialogSource.matchAll(/\b([A-Za-z_$][\w$]*Style)\b/g), (match) => match[1]))
const missingStyles = Array.from(usedStyles).filter((name) => !importedStyles.has(name) && !new RegExp('(?:function|const|let)\\s+' + name + '\\b').test(dialogSource))
equal(missingStyles.length, 0, 'every style identifier in the dialog is imported (' + missingStyles.join(', ') + ')')

// ---------------------------------------------------------------------------
// Generated Client bundle
// ---------------------------------------------------------------------------

const bundle = readFileSync(join(here, 'lib', 'client.js'), 'utf8')
let entry = null
const sandbox = { window: { __ModuleLoader__: { load(definition) { entry = definition } } } }
vm.runInNewContext(bundle, sandbox, { filename: 'lib/client.js' })
check(entry !== null, 'bundle registers a module factory')
equal(entry.id, 'dsh-plugin-session-settings', 'bundle id equals the package name')
check(bundle.indexOf('@deepseek-ai/dsh-client-ui-primitives') === -1, 'bundle imports no Harness Client package')

function fakeReact() {
  let states = []
  let index = 0
  return {
    createElement(type, props) { return { type, props: { ...(props || {}) } } },
    useState(initial) {
      const at = index++
      if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial
      return [states[at], (value) => { states[at] = value }]
    },
    useEffect() {},
    useRef(initial) {
      const at = index++
      if (!(at in states)) states[at] = { current: initial }
      return states[at]
    },
    reset(render) { states = []; index = 0; return render() },
  }
}

const ReactFake = fakeReact()
const jsxRuntime = {
  jsx(type, props) { return { type, props: { ...(props || {}) } } },
  jsxs(type, props) { return { type, props: { ...(props || {}) } } },
  Fragment: 'Fragment',
}
const plugin = entry.factory((specifier) => {
  if (specifier === 'react') return ReactFake
  if (specifier === 'react/jsx-runtime') return jsxRuntime
  throw new Error('unexpected require: ' + specifier)
})
check(typeof plugin.apply === 'function', 'bundle exports apply')
check(Array.isArray(plugin.inject), 'bundle exports inject')

const registrations = []
const disposers = []
const fakeContext = {
  effect(callback) {
    const dispose = callback()
    if (typeof dispose === 'function') disposers.push(dispose)
    return dispose
  },
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
    getSnapshot: () => ({ active: 'en' }),
  },
  slots: {
    inject(name, callback) { callback() },
    register(options, component) { registrations.push({ options, component }) },
  },
}
plugin.apply(fakeContext)
const trigger = registrations.find((registration) => registration.options.id === 'session-settings' && registration.options.name === 'conversation.session.header.actions')
const overlay = registrations.find((registration) => registration.options.id === 'session-settings' && registration.options.name === 'shell.overlay')
check(trigger !== undefined, 'Client registers the Session header trigger')
check(overlay !== undefined, 'Client registers the shell overlay')

const overlayInjected = overlay.options.inject()
const closed = ReactFake.reset(() => overlay.component({ t: (key) => key, ...overlayInjected }))
equal(closed, null, 'overlay renders nothing while closed')

let opened
const injected = trigger.options.inject()
injected.open = (sessionId) => { opened = sessionId }
const tree = ReactFake.reset(() => trigger.component({ sessionId: 'session-1', t: (key) => key, ...injected }))
check(tree.type === 'button', 'trigger renders a button')
check(tree.props['aria-label'] === 'button.label', 'trigger has a localized accessible label')
tree.props.onClick()
equal(opened, 'session-1', 'trigger click opens the Session dialog')

disposers.forEach((dispose) => dispose())


console.log('\n' + checks + ' checks, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1
