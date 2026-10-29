/** Inline styles for the header action and the dialog. */

export function triggerStyle() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    padding: 0,
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    cursor: 'pointer',
    flex: 'none',
  }
}

export const backdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'rgba(0, 0, 0, 0.32)',
  boxSizing: 'border-box',
  pointerEvents: 'auto',
}

export const panelStyle = {
  display: 'flex',
  flexDirection: 'column',
  width: 'min(760px, 100%)',
  maxHeight: 'min(720px, 84vh)',
  minHeight: '320px',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-lg, 12px)',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.28)',
  overflow: 'hidden',
  boxSizing: 'border-box',
}

export const headerStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '16px 18px 10px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3)',
}

export const titleStyle = {
  margin: 0,
  fontSize: '16px',
  lineHeight: '22px',
  fontWeight: 600,
}

export const subtitleStyle = {
  margin: '3px 0 0',
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
}

export const tabBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '0 12px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3)',
}

export function tabStyle(active) {
  return {
    height: '36px',
    padding: '0 10px',
    border: 'none',
    borderBottom: active ? '2px solid var(--dsw-alias-label-primary)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
    font: 'inherit',
    fontSize: '13px',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
  }
}

export const bodyStyle = {
  flex: '1 1 auto',
  minHeight: 0,
  overflow: 'auto',
  padding: '16px 18px',
}

export const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '10px 18px',
  borderTop: '0.5px solid var(--dsw-alias-border-l3)',
}

export const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginBottom: '18px',
}

export const sectionTitleStyle = {
  margin: 0,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 600,
}

export const hintStyle = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary)',
}

export const warningStyle = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-state-warning-primary, #b26a00)',
}

export const errorStyle = {
  margin: 0,
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-state-error-primary, #d93025)',
}

export function optionStyle(selected) {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '9px',
    padding: '8px 10px',
    border: '0.5px solid ' + (selected ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l3)'),
    borderRadius: '8px',
    background: selected ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
    cursor: 'pointer',
  }
}

export const presetRowStyle = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  gap: '8px',
  flexWrap: 'nowrap',
  overflowX: 'auto',
}

export function presetOptionStyle(selected, dangerous) {
  const color = dangerous ? 'var(--dsw-alias-state-error-primary, #d93025)' : 'var(--dsw-alias-label-primary)'
  return {
    flex: '1 1 0',
    minWidth: '132px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '3px',
    padding: '10px 11px',
    border: '1px solid ' + (selected ? color : dangerous ? color : 'var(--dsw-alias-border-l3)'),
    borderRadius: '8px',
    background: selected ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
    color,
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    boxSizing: 'border-box',
  }
}

export const presetNameStyle = {
  fontSize: '12px',
  lineHeight: '17px',
  fontWeight: 600,
}

export const presetDescriptionStyle = {
  fontSize: '11px',
  lineHeight: '15px',
  color: 'var(--dsw-alias-label-tertiary)',
}

export function policyButtonStyle(active, kind) {
  const color = kind === 'block'
    ? 'var(--dsw-alias-state-error-primary, #d93025)'
    : 'var(--dsw-alias-state-success-primary, #1a7f37)'
  return {
    height: '22px',
    padding: '0 8px',
    border: '0.5px solid ' + (active ? color : 'var(--dsw-alias-border-l3)'),
    borderRadius: '6px',
    background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
    color: active ? color : 'var(--dsw-alias-label-tertiary)',
    font: 'inherit',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    opacity: 1,
  }
}

export function dangerButtonStyle(disabled) {
  return {
    height: '30px',
    padding: '0 12px',
    border: '1px solid var(--dsw-alias-state-error-primary, #d93025)',
    borderRadius: '7px',
    background: 'transparent',
    color: 'var(--dsw-alias-state-error-primary, #d93025)',
    font: 'inherit',
    fontSize: '12px',
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

export const optionTitleStyle = {
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 500,
}

export const optionDescriptionStyle = {
  fontSize: '12px',
  lineHeight: '17px',
  color: 'var(--dsw-alias-label-tertiary)',
}

export const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

export const labelStyle = {
  fontSize: '13px',
  fontWeight: 500,
}

export function inputStyle() {
  return {
    boxSizing: 'border-box',
    height: '30px',
    padding: '0 9px',
    border: '0.5px solid var(--dsw-alias-border-l4)',
    borderRadius: '7px',
    background: 'var(--dsw-alias-bg-layer-3)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: '12px',
  }
}

export function primaryButtonStyle(disabled) {
  return {
    height: '30px',
    padding: '0 12px',
    border: 'none',
    borderRadius: '7px',
    background: 'var(--dsw-alias-button-primary-fill, #4d6bfe)',
    color: 'var(--dsw-alias-label-primary-foreground, #fff)',
    font: 'inherit',
    fontSize: '12px',
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

export function secondaryButtonStyle(disabled) {
  return {
    height: '30px',
    padding: '0 12px',
    border: '0.5px solid var(--dsw-alias-border-l3)',
    borderRadius: '7px',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: '12px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

export const chipRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
}

export const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: '24px',
  padding: '0 4px 0 8px',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: '12px',
  background: 'var(--dsw-alias-bg-layer-2)',
  fontSize: '11px',
  fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
}

export const chipRemoveStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: '14px',
}

export const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

export function listItemStyle(expanded) {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '9px 10px',
    border: '0.5px solid var(--dsw-alias-border-l3)',
    borderRadius: '8px',
    background: expanded ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
  }
}

export const itemHeaderStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  width: '100%',
  border: 'none',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  textAlign: 'left',
  cursor: 'pointer',
  padding: 0,
}

export const monoNameStyle = {
  fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
  fontSize: '12px',
  fontWeight: 600,
}

export const itemDescriptionStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  fontSize: '12px',
  color: 'var(--dsw-alias-label-tertiary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const codeBlockStyle = {
  margin: 0,
  padding: '8px 10px',
  borderRadius: '7px',
  background: 'var(--dsw-alias-bg-layer-3)',
  color: 'var(--dsw-alias-label-secondary)',
  fontFamily: 'var(--dsw-font-mono, ui-monospace, monospace)',
  fontSize: '11px',
  lineHeight: '16px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '260px',
  overflow: 'auto',
}

export const metaBadgeStyle = {
  flex: 'none',
  padding: '1px 6px',
  borderRadius: '9px',
  background: 'var(--dsw-alias-bg-layer-3)',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '10px',
  lineHeight: '16px',
}

export const toolListStyle = {
  display: 'flex',
  flexDirection: 'column',
}

export const toolRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 2px',
}

export const toolArtworkStyle = {
  flex: 'none',
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ffffff',
  boxSizing: 'border-box',
}

export const toolItemStyle = {
  display: 'flex',
  flexDirection: 'column',
}

export const toolBodyButtonStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
}

export const toolDetailsStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '0 2px 10px 52px',
}

export const toolBodyStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}

export const toolNameStyle = {
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
}

export const toolDescriptionStyle = {
  fontSize: '12px',
  lineHeight: '17px',
  color: 'var(--dsw-alias-label-tertiary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export function switchTrackStyle(checked, disabled) {
  return {
    position: 'relative',
    flex: 'none',
    width: '38px',
    height: '22px',
    padding: '2px',
    border: 'none',
    borderRadius: '11px',
    background: checked
      ? 'var(--dsw-alias-state-success-primary, #2ea043)'
      : 'var(--dsw-alias-state-error-primary, #d93025)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    boxSizing: 'border-box',
    transition: 'background-color 120ms ease',
  }
}

export function switchKnobStyle(checked) {
  return {
    display: 'block',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
    transform: checked ? 'translateX(16px)' : 'translateX(0)',
    transition: 'transform 120ms ease',
  }
}

export const disabledLineStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  margin: '12px 0 0',
  paddingTop: '10px',
  borderTop: '0.5px solid var(--dsw-alias-border-l3)',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  lineHeight: '18px',
}

export const emptyStyle = {
  padding: '28px 0',
  textAlign: 'center',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
}
