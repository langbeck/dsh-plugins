/**
 * Bundle selftest: execute the generated client bundle in a vm with stub
 * browser globals, apply it to a fake slot registry, and assert the pills and
 * the settings dialog (including live re-styling after a toggle).
 *
 *   node selftest.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, 'lib', 'client.js'), 'utf8')

let checks = 0
let failed = 0
function check(ok, label) {
  checks += 1
  if (ok) {
    console.log('ok   ' + label)
  } else {
    failed += 1
    console.error('FAIL ' + label)
  }
}

let entry = null
const appendedStyles = []
const fakeHead = {
  appendChild: function (node) {
    node.parentNode = fakeHead
    appendedStyles.push(node)
    return node
  },
  removeChild: function (node) { return node },
}
const sandbox = {
  window: { __ModuleLoader__: { load: function (definition) { entry = definition } } },
  document: {
    head: fakeHead,
    createElement: function (tag) {
      return {
        tagName: tag,
        attrs: {},
        textContent: '',
        parentNode: null,
        setAttribute: function (key, value) { this.attrs[key] = value },
      }
    },
  },
}
vm.runInNewContext(bundle, sandbox, { filename: 'lib/client.js' })
check(entry !== null, 'bundle registers a module factory')
check(entry.id === 'dsh-plugin-slot-explorer', 'bundle id equals the package name')

const React = {
  Fragment: 'Fragment',
  createElement: function (type, props) {
    return { type: type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }
  },
  useState: function (initial) {
    return [typeof initial === 'function' ? initial() : initial, function () {}]
  },
  useEffect: function () {},
  useRef: function (value) {
    return { current: value === undefined ? null : value }
  },
}
const plugin = entry.factory(function (id) {
  if (id === 'react') return React
  throw new Error('unexpected require: ' + id)
})
check(typeof plugin.apply === 'function', 'module exports apply')
check(Array.isArray(plugin.inject) && plugin.inject.indexOf('slots') !== -1, 'module injects the slots service')

const registrations = []
let changeHandler = null
const slots = {
  inject: function (name, callback) { callback() },
  register: function (options, component) {
    registrations.push({ options: options, component: component })
    return function () {}
  },
  snapshot: function () {
    return [{
      type: 'slot', name: 'root', kind: 'single', children: [
        { type: 'slot', name: 'demo.list', kind: 'list', children: [] },
        { type: 'slot', name: 'demo.single', kind: 'single', children: [] },
        { type: 'factory', name: 'demo.factory', children: [
          { type: 'slot', name: 'demo.factory.list', kind: 'list', children: [] },
        ] },
      ],
    }]
  },
}
const cleanups = []
const ctx = {
  slots: slots,
  on: function (name, handler) { if (name === 'slots/changed') changeHandler = handler },
  effect: function (callback) {
    const cleanup = callback()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
    return cleanup
  },
}
plugin.apply(ctx)

function pillFor(name) {
  return registrations.find(function (r) { return r.options.id === 'slot-pill' && r.options.name === name })
}
const pills = registrations.filter(function (r) { return r.options.id === 'slot-pill' })
const dialog = registrations.find(function (r) { return r.options.id === 'slot-explorer-settings' })

check(pills.length === 39, 'one pill per known list slot plus live list slots (' + pills.length + ')')
check(dialog !== undefined && dialog.options.name === 'shell.overlay' && dialog.options.order === 90,
  'settings dialog registers into shell.overlay at order 90')
check(!registrations.some(function (r) { return r.options.name === 'demo.single' }), 'single slots are not labelled')
check(appendedStyles.length === 1 && appendedStyles[0].tagName === 'style', 'apply injects one border-animation style tag')
check(/@keyframes dsh-slot-pill-pulse/.test(appendedStyles[0].textContent), 'injected stylesheet defines the pulse keyframes')
check(/dsh-slot-pill-rainbow/.test(appendedStyles[0].textContent) && /dsh-slot-pill-chase/.test(appendedStyles[0].textContent), 'injected stylesheet defines every border animation')
check(cleanups.length >= 1, 'style injection is disposed through ctx.effect')
const before = registrations.length
changeHandler()
check(registrations.length === before, 'rescan is idempotent')

// ---- default pill ---------------------------------------------------------
const pill = pillFor('shell.overlay')
check(pill !== undefined, 'shell.overlay pill exists')
const rendered = pill.component({})
check(rendered.type === 'span', 'pill renders a span')
check(rendered.children[0] === 'shell.overlay', 'pill inner text is the slot name')
check(rendered.props.title === 'shell.overlay', 'pill tooltip is the slot name')
check(/1px dashed/.test(rendered.props.style.border), 'pill has a dashed border')
check(rendered.props.style.borderRadius === '10px', 'pill has a fixed default roundness')
check(rendered.props.style.pointerEvents === 'auto', 'pill keeps pointer events for its tooltip')
check(rendered.props.style.cursor === 'pointer', 'pill shows a pointer cursor')
check(rendered.props.role === 'button' && rendered.props.tabIndex === 0, 'pill is focusable')
check(typeof rendered.props.onClick === 'function' && typeof rendered.props.onKeyDown === 'function', 'pill is clickable and keyboard-activatable')
check(rendered.props.style.width === undefined && rendered.props.style.height === '16px', 'pill is not stretched by default')

// ---- dialog tree ---------------------------------------------------------
function collect(node, out) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    node.forEach(function (child) { collect(child, out) })
    return out
  }
  if (typeof node !== 'object' || node.type === undefined) return out
  out.push(node)
  node.children.forEach(function (child) { collect(child, out) })
  return out
}

const tree = dialog.component({})
const nodes = collect(tree, [])
const frame = nodes.find(function (n) { return n.props !== undefined && n.props['data-slot-explorer'] === 'dialog' })
check(frame !== undefined && frame.props.style.position === 'fixed', 'dialog is a fixed floating frame')
check(frame.props.style.left === '50%' && frame.props.style.top === '50%' && /translate\(-50%, -50%\)/.test(frame.props.style.transform), 'dialog starts centered in the viewport')
check(frame.props.style.width === '654px' && frame.props.style.height === '490px', 'dialog starts at 654 x 490 (20% wider and taller)')
check(frame.props.style.minWidth === '300px' && frame.props.style.minHeight === '240px', 'dialog has a minimum size')
check(frame.props.style.zIndex === 1000, 'dialog is layered above other components')
check(frame.props.style.opacity === '0.95', 'dialog is 95% opaque by default')
check(bundle.indexOf("const DIALOG_OPACITY = '0.95'") !== -1, 'default dialog opacity constant is 95%')
check(bundle.indexOf("const DIALOG_DRAG_OPACITY = '0.6'") !== -1, 'dragged dialog opacity constant is 60%')
const grip = nodes.find(function (n) { return n.props !== undefined && n.props['data-resize'] === 'grip' })
check(grip !== undefined && grip.props.style.cursor === 'nwse-resize', 'dialog has a bottom-right resize grip')
check(typeof grip.props.onPointerDown === 'function' && typeof grip.props.onPointerMove === 'function', 'resize grip tracks pointer drags')

// ---- title bar: name + collapse/expand ----------------------------------
const headerNode = nodes.find(function (n) { return n.props !== undefined && n.props.onDoubleClick !== undefined && n.props.style !== undefined && n.props.style.cursor === 'grab' })
check(headerNode !== undefined, 'dialog has a draggable title bar')
check(collect(dialog.component({}), []).some(function (n) { return n.children.indexOf('Slot Explorer') !== -1 }), 'dialog title is "Slot Explorer"')
headerNode.props.onDoubleClick()
const collapsedNodes = collect(dialog.component({}), [])
const collapsedFrame = collapsedNodes.find(function (n) { return n.props !== undefined && n.props['data-slot-explorer'] === 'dialog' })
check(collapsedFrame !== undefined && collapsedFrame.props['data-collapsed'] === 'true', 'double-clicking the title collapses the dialog')
check(collapsedFrame.props.style.height === 'auto' && collapsedFrame.props.style.width === '200px', 'collapsed dialog is the title bar only')
check(!collapsedNodes.some(function (n) { return n.props !== undefined && n.props['data-sidebar'] === 'slots' }), 'collapsed dialog hides the body')
check(!collapsedNodes.some(function (n) { return n.props !== undefined && n.props['data-resize'] === 'grip' }), 'collapsed dialog hides the resize grip')
const collapsedHeader = collapsedNodes.find(function (n) { return n.props !== undefined && n.props.onDoubleClick !== undefined && n.props.style !== undefined && n.props.style.cursor === 'grab' })
collapsedHeader.props.onDoubleClick()
const restoredNodes = collect(dialog.component({}), [])
const restoredFrame = restoredNodes.find(function (n) { return n.props !== undefined && n.props['data-slot-explorer'] === 'dialog' })
check(restoredFrame.props['data-collapsed'] === 'false', 'double-clicking again expands the dialog')
check(restoredFrame.props.style.width === '654px' && restoredFrame.props.style.height === '490px', 'expanded dialog restores its normal size')
check(restoredNodes.some(function (n) { return n.props !== undefined && n.props['data-sidebar'] === 'slots' }), 'expanded dialog restores the body')
let dialogButtons = nodes.filter(function (n) { return n.type === 'button' && n.props['data-slot'] !== undefined })
check(dialogButtons.length === 0, 'tree starts collapsed (' + dialogButtons.length + ' visible leaves)')
const sidebarNode = nodes.find(function (n) { return n.props !== undefined && n.props['data-sidebar'] === 'slots' })
check(sidebarNode !== undefined && sidebarNode.props.style.width === '200px', 'sidebar is wider (200px)')

// ---- file-like slot tree -------------------------------------------------
function leafCount() {
  return collect(dialog.component({}), []).filter(function (n) { return n.type === 'button' && n.props['data-slot'] !== undefined }).length
}
function groupCount() {
  return collect(dialog.component({}), []).filter(function (n) { return n.type === 'button' && n.props['data-group-toggle'] !== undefined }).length
}
const groupToggles = nodes.filter(function (n) { return n.type === 'button' && n.props['data-group-toggle'] !== undefined })
check(groupToggles.length === 7, 'collapsed tree shows only the root groups (' + groupToggles.length + ')')
const expandAllButton = nodes.find(function (n) { return n.type === 'button' && n.props['data-tree-action'] === 'expand' })
const collapseAllButton = nodes.find(function (n) { return n.type === 'button' && n.props['data-tree-action'] === 'collapse' })
check(expandAllButton !== undefined && collapseAllButton !== undefined, 'sidebar has expand-all and collapse-all buttons')
expandAllButton.props.onClick()
check(leafCount() === 39, 'expand-all reveals every slot leaf')
const expandedNodes = collect(dialog.component({}), [])
dialogButtons = expandedNodes.filter(function (n) { return n.type === 'button' && n.props['data-slot'] !== undefined })
check(groupCount() === 35, 'expand-all opens every branch (' + groupCount() + ' groups)')
collapseAllButton.props.onClick()
check(leafCount() === 0, 'collapse-all hides every leaf')
const conversationToggle = expandedNodes.find(function (n) { return n.type === 'button' && n.props['data-group-toggle'] === 'conversation' })
check(conversationToggle !== undefined, 'dot segments become tree groups')
conversationToggle.props.onClick()
check(leafCount() === 1, 'expanding one branch reveals its direct leaves (' + leafCount() + ')')
expandAllButton.props.onClick()
check(leafCount() === 39, 'tree is fully open again before the remaining checks')

// ---- searchable sidebar --------------------------------------------------
const searchInput = nodes.find(function (n) { return n.type === 'input' && n.props['data-search'] === 'slots' })
check(searchInput !== undefined, 'sidebar has a slot search box')
searchInput.props.onChange({ target: { value: 'setting' } })
const filteredButtons = collect(dialog.component({}), []).filter(function (n) { return n.type === 'button' && n.props['data-slot'] !== undefined })
check(filteredButtons.length === 6 && filteredButtons.every(function (n) { return n.props['data-slot'].indexOf('settings.') === 0 }), 'search filters the slot list (' + filteredButtons.length + ')')
searchInput.props.onChange({ target: { value: 'no-such-slot' } })
const emptyNodes = collect(dialog.component({}), [])
check(emptyNodes.some(function (n) { return n.children.indexOf('No matching slot') !== -1 }), 'search shows an empty state')
searchInput.props.onChange({ target: { value: '' } })
const inputs = nodes.filter(function (n) { return n.type === 'input' && n.props['data-setting'] !== undefined })
check(inputs.length === 3, 'center panel has the three per-slot switches')
const numericInputs = nodes.filter(function (n) { return n.type === 'input' && n.props['data-field'] !== undefined })
check(numericInputs.length === 7, 'center panel has width, height, roundness, and four margin inputs (' + numericInputs.length + ')')
function numericInputFor(field) {
  return numericInputs.find(function (n) { return n.props['data-field'] === field })
}
function rowOf(key) {
  return nodes.find(function (n) { return n.props !== undefined && n.props['data-row'] === key })
}
const sizeRowNode = rowOf('size')
const marginRowNode = rowOf('margins')
check(sizeRowNode !== undefined && Array.isArray(sizeRowNode.children[0]) && sizeRowNode.children[0].length === 3, 'width, height and roundness sit side by side')
check(marginRowNode !== undefined && Array.isArray(marginRowNode.children[0]) && marginRowNode.children[0].length === 4, 'the four margins sit side by side')

function inputFor(setting) {
  return inputs.find(function (n) { return n.props['data-setting'] === setting })
}
function toggle(setting, checked) {
  inputFor(setting).props.onChange({ target: { checked: checked } })
}
check(inputFor('fillX').props.checked === false, 'fill-horizontally starts unchecked')

// ---- hover highlight -----------------------------------------------------
const hoverButton = dialogButtons.find(function (n) { return n.props['data-slot'] === 'settings.section' })
check(pillFor('settings.section').component({}).props.style.borderColor === undefined, 'no highlight before hover')
hoverButton.props.onMouseEnter()
const hoveredPill = pillFor('settings.section').component({})
check(hoveredPill.props.style.borderColor === 'var(--dsw-alias-brand-primary)', 'hovering a sidebar slot highlights that slot border')
check(/dsh-slot-pill-pulse/.test(hoveredPill.props.style.animation), 'hovering uses the default pulse animation')
check(pillFor('shell.overlay').component({}).props.style.borderColor === undefined, 'hovering a sidebar slot does not highlight other slots')
hoverButton.props.onMouseLeave()
check(pillFor('settings.section').component({}).props.style.borderColor === undefined, 'leaving the sidebar slot clears the hover highlight')
check(pillFor('settings.section').component({}).props.style.animation === undefined, 'leaving the sidebar slot stops the hover animation')

// ---- live re-styling -----------------------------------------------------
toggle('fillX', true)
const filledX = pillFor('shell.overlay').component({})
check(filledX.props.style.width === '100%', 'fill-horizontally widens the pill to the container')
check(filledX.props.style.justifyContent === 'center', 'filled pill centers its text')

toggle('fillY', true)
const filledY = pillFor('shell.overlay').component({})
check(filledY.props.style.height === '100%', 'fill-vertically stretches the pill to the container height')
check(filledY.props.style.alignSelf === 'stretch', 'filled pill stretches in flex containers')

toggle('highlight', true)
const highlighted = pillFor('shell.overlay').component({})
check(highlighted.props.style.borderColor === 'var(--dsw-alias-brand-primary)', 'highlight changes the border color')
check(highlighted.props.style.borderStyle === 'solid', 'highlight makes the border solid')
check(highlighted.props.style.background === 'var(--dsw-alias-bg-overlay)' && highlighted.props.style.color === 'var(--dsw-alias-label-secondary)', 'highlight leaves background and text color alone')
check(highlighted.props.style.outline === undefined, 'highlight does not draw an outline')
check(/dsh-slot-pill-pulse/.test(highlighted.props.style.animation), 'pulse is the default border animation')

// ---- border animation dropdown ------------------------------------------
const animSelect = nodes.find(function (n) { return n.type === 'select' && n.props['data-select'] === 'border-animation' })
check(animSelect !== undefined, 'dialog has a border animation dropdown')
check(animSelect.props.value === 'pulse', 'border animation defaults to pulse')
check(Array.isArray(animSelect.children[0]) && animSelect.children[0].length === 5, 'border animation dropdown lists five options')
animSelect.props.onChange({ target: { value: 'rainbow' } })
check(/dsh-slot-pill-rainbow/.test(pillFor('shell.overlay').component({}).props.style.animation), 'border animation can be switched')
toggle('highlight', false)
check(pillFor('shell.overlay').component({}).props.style.animation === undefined, 'border animation stops when not highlighted')
toggle('highlight', true)
animSelect.props.onChange({ target: { value: 'none' } })
check(pillFor('shell.overlay').component({}).props.style.animation === undefined, 'none disables the border animation')

// ---- optional explicit size ---------------------------------------------
check(numericInputFor('width').props.value === '' && numericInputFor('height').props.value === '', 'size overrides start empty (auto)')
numericInputFor('width').props.onChange({ target: { value: '120' } })
const sizedWidth = pillFor('shell.overlay').component({})
check(sizedWidth.props.style.width === '120px', 'explicit width is applied to the pill')
check(sizedWidth.props.style.maxWidth === 'none', 'explicit width is not clamped by max-width')
numericInputFor('height').props.onChange({ target: { value: '40' } })
check(pillFor('shell.overlay').component({}).props.style.height === '40px', 'explicit height is applied to the pill')
numericInputFor('width').props.onChange({ target: { value: '' } })
check(pillFor('shell.overlay').component({}).props.style.width === '100%', 'clearing width falls back to fill-horizontally')
numericInputFor('height').props.onChange({ target: { value: '' } })
check(pillFor('shell.overlay').component({}).props.style.height === '100%', 'clearing height falls back to fill-vertically')
numericInputFor('width').props.onChange({ target: { value: 'nope' } })
check(pillFor('shell.overlay').component({}).props.style.width === '100%', 'invalid width is treated as auto')

// ---- size-independent roundness -----------------------------------------
check(numericInputFor('radius').props.value === '10', 'roundness defaults to 10px')
numericInputFor('width').props.onChange({ target: { value: '120' } })
numericInputFor('height').props.onChange({ target: { value: '40' } })
check(pillFor('shell.overlay').component({}).props.style.borderRadius === '10px', 'roundness stays fixed when the pill is resized')
numericInputFor('radius').props.onChange({ target: { value: '2' } })
check(pillFor('shell.overlay').component({}).props.style.borderRadius === '2px', 'roundness is configurable')
numericInputFor('radius').props.onChange({ target: { value: '0' } })
check(pillFor('shell.overlay').component({}).props.style.borderRadius === '0px', 'zero roundness is allowed')
numericInputFor('radius').props.onChange({ target: { value: '' } })
check(pillFor('shell.overlay').component({}).props.style.borderRadius === '10px', 'clearing roundness restores the default')
numericInputFor('radius').props.onChange({ target: { value: 'x' } })
check(pillFor('shell.overlay').component({}).props.style.borderRadius === '10px', 'invalid roundness restores the default')

// ---- optional margins ----------------------------------------------------
check(numericInputFor('marginTop').props.value === '', 'margins start empty (auto)')
numericInputFor('marginTop').props.onChange({ target: { value: '8' } })
numericInputFor('marginRight').props.onChange({ target: { value: '0' } })
numericInputFor('marginBottom').props.onChange({ target: { value: '12' } })
numericInputFor('marginLeft').props.onChange({ target: { value: '4' } })
const margined = pillFor('shell.overlay').component({})
check(margined.props.style.marginTop === '8px' && margined.props.style.marginLeft === '4px', 'margins are applied to the pill')
check(margined.props.style.marginBottom === '12px' && margined.props.style.marginRight === '0px', 'all four margins are independent')
numericInputFor('marginTop').props.onChange({ target: { value: '' } })
check(pillFor('shell.overlay').component({}).props.style.marginTop === undefined, 'clearing a margin removes it')
numericInputFor('marginRight').props.onChange({ target: { value: 'x' } })
check(pillFor('shell.overlay').component({}).props.style.marginRight === undefined, 'invalid margin is treated as auto')

// ---- per-slot isolation --------------------------------------------------
const otherButton = dialogButtons.find(function (n) { return n.props['data-slot'] === 'settings.section' })
otherButton.props.onClick()
const reTree = dialog.component({})
const reNodes = collect(reTree, [])
const otherPill = pillFor('settings.section').component({})
check(otherPill.props.style.width === undefined, 'another slot keeps its own defaults')
const otherFill = reNodes.find(function (n) { return n.type === 'input' && n.props['data-setting'] === 'fillX' })
check(otherFill.props.checked === false, 'center panel shows the selected slot settings')

const backButton = dialogButtons.find(function (n) { return n.props['data-slot'] === 'shell.overlay' })
backButton.props.onClick()
const backTree = dialog.component({})
const backNodes = collect(backTree, [])
const backFill = backNodes.find(function (n) { return n.type === 'input' && n.props['data-setting'] === 'fillX' })
check(backFill.props.checked === true, 'returning to a slot restores its settings')

// ---- multiple pills per slot --------------------------------------------
function currentNodes() {
  return collect(dialog.component({}), [])
}
function rowButton(target) {
  return currentNodes().find(function (n) { return n.type === 'button' && n.props['data-target'] === target })
}
function currentPills() {
  const element = pillFor('shell.overlay').component({})
  return element.type === 'Fragment' ? element.children[0] : [element]
}
function toggleCurrent(setting, checked) {
  const input = currentNodes().find(function (n) { return n.type === 'input' && n.props['data-setting'] === setting })
  input.props.onChange({ target: { checked: checked } })
}
function numericFieldNow(field) {
  return currentNodes().find(function (n) { return n.type === 'input' && n.props['data-field'] === field })
}
// Reset this slot so the multi-pill checks do not inherit earlier edits.
rowButton('all').props.onClick()
toggleCurrent('fillX', false)
toggleCurrent('fillY', false)
toggleCurrent('highlight', false)
numericFieldNow('marginBottom').props.onChange({ target: { value: '' } })
numericFieldNow('marginLeft').props.onChange({ target: { value: '' } })
numericFieldNow('width').props.onChange({ target: { value: '' } })
numericFieldNow('height').props.onChange({ target: { value: '' } })
check(currentPills()[0].props.style.width === undefined && currentPills()[0].props.style.height === '16px' && currentPills()[0].props.style.marginLeft === undefined, 'slot reset before the multi-pill checks')
const instanceRow = currentNodes().find(function (n) { return n.props !== undefined && n.props['data-instance-row'] !== undefined })
const firstRowButtons = instanceRow.children[0]
check(Array.isArray(firstRowButtons) && firstRowButtons[0].props['data-add-instance'] !== undefined, 'the + button comes first in the instance row')
check(firstRowButtons[1].props['data-target'] === 'all' && firstRowButtons[2].props['data-target'] === '0', 'All is fixed before the instance buttons')
check(currentPills().length === 1, 'a slot starts with one pill')
firstRowButtons[0].props.onClick()
const twoPills = pillFor('shell.overlay').component({})
check(twoPills.type === 'Fragment' && Array.isArray(twoPills.children[0]) && twoPills.children[0].length === 2, 'the + button adds a second pill to the slot')
check(currentNodes().filter(function (n) { return n.type === 'button' && n.props['data-target'] !== undefined }).length === 3, 'the row gains one button per instance')
toggleCurrent('fillX', true)
check(currentPills()[1].props.style.width === '100%' && currentPills()[0].props.style.width === undefined, 'editing an instance affects only that pill')
rowButton('all').props.onClick()
toggleCurrent('fillX', true)
check(currentPills()[0].props.style.width === '100%' && currentPills()[1].props.style.width === '100%', 'editing All reaches every pill')
rowButton('1').props.onClick()
toggleCurrent('fillX', false)
check(currentPills()[1].props.style.width === undefined && currentPills()[0].props.style.width === '100%', 'a per-instance override wins over All')
rowButton('all').props.onClick()
toggleCurrent('fillY', true)
check(currentPills()[0].props.style.height === '100%' && currentPills()[1].props.style.height === '100%', 'a later All edit reaches previously overridden pills')
check(currentPills()[1].props.style.width === undefined, 'an All edit of another field keeps the instance override')
const addMore = currentNodes().find(function (n) { return n.type === 'button' && n.props['data-add-instance'] !== undefined })
addMore.props.onClick()
check(currentPills().length === 3, 'the + button can add more pills')

// ---- click a pill to open its settings -----------------------------------
collapseAllButton.props.onClick()
check(leafCount() === 0, 'tree collapsed before the pill-click checks')
let activationPrevented = false
pillFor('settings.section').component({}).props.onKeyDown({
  key: 'Enter',
  preventDefault: function () { activationPrevented = true },
  stopPropagation: function () {},
})
check(activationPrevented === true, 'Enter on a pill activates it')
const keyTitle = collect(dialog.component({}), []).find(function (n) { return n.props !== undefined && n.props['data-selected-slot'] !== undefined })
check(keyTitle !== undefined && keyTitle.props['data-selected-slot'] === 'settings.section', 'keyboard activation selects the slot in the dialog')
let propagationStopped = false
pillFor('settings.general.item').component({}).props.onClick({
  stopPropagation: function () { propagationStopped = true },
})
check(propagationStopped === true, 'pill click does not bubble into the slot owner')
const clickedNodes = collect(dialog.component({}), [])
const clickedTitle = clickedNodes.find(function (n) { return n.props !== undefined && n.props['data-selected-slot'] !== undefined })
check(clickedTitle !== undefined && clickedTitle.props['data-selected-slot'] === 'settings.general.item', 'clicking a pill selects that slot in the dialog')
check(clickedNodes.some(function (n) { return n.type === 'button' && n.props['data-slot'] === 'settings.general.item' }), 'clicking a pill expands the tree to its branch')

console.log(checks + ' checks, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1
