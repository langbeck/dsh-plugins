/** Inline styles for the tool firewall configuration form. */

export const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
  fontSize: '13px',
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
  padding: '8px 0',
}

export const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '8px 0 0',
  borderTop: '0.5px solid var(--dsw-alias-border-l3)',
}

export const tabbedSectionStyle = {
  ...sectionStyle,
  padding: 0,
  borderTop: 'none',
}

export const sectionTitleStyle = {
  margin: 0,
  fontSize: '13px',
  lineHeight: '20px',
  fontWeight: 600,
}

export const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  maxWidth: '520px',
}

export const checkboxStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

export const labelStyle = {
  color: 'var(--dsw-alias-label-primary)',
  fontWeight: 500,
}

export const hintStyle = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
}

export const errorStyle = {
  color: 'var(--dsw-alias-state-error-primary)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
}

export const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

export const tabbedFooterStyle = {
  ...footerStyle,
  flex: 'none',
  padding: '10px 16px',
  background: 'var(--dsw-alias-bg-layer-1)',
}

export const tabbedShellStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  fontSize: '13px',
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
}

export const tabbedScrollStyle = {
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minHeight: '100px',
  overflowY: 'auto',
  padding: '8px 16px 12px',
}

export const modelListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

export const modelWarningStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '8px 10px',
  border: '0.5px solid var(--dsw-alias-state-error-primary, #d93025)',
  borderRadius: 'var(--dsw-radius-md, 8px)',
  background: 'var(--dsw-alias-bg-layer-2)',
}

export const modelCardStyle = {
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-md, 8px)',
  background: 'var(--dsw-alias-bg-layer-2)',
  overflow: 'hidden',
}

export const modelCardSummaryStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 12px',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: '20px',
  fontWeight: 600,
  listStyle: 'none',
}

export const modelCardBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '0 12px 12px',
  borderTop: '0.5px solid var(--dsw-alias-border-l3)',
  paddingTop: '12px',
}

export function modelStatusStyle(tone) {
  return {
    flex: 'none',
    fontSize: '11px',
    lineHeight: '16px',
    fontWeight: 600,
    color: tone === 'error'
      ? 'var(--dsw-alias-state-error-primary, #d93025)'
      : tone === 'off'
        ? '#f59e0b'
        : tone === 'muted'
          ? 'var(--dsw-alias-label-tertiary)'
          : 'var(--dsw-alias-label-primary)',
  }
}

export function inputStyle(disabled, width = '96px') {
  return {
    boxSizing: 'border-box',
    width,
    height: '32px',
    padding: '0 10px',
    border: '0.5px solid var(--dsw-alias-border-l4)',
    borderRadius: 'var(--dsw-radius-md, 8px)',
    background: disabled ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-bg-layer-3)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: '13px',
    opacity: disabled ? 0.6 : 1,
  }
}

export function selectStyle(disabled) {
  return {
    ...inputStyle(disabled, '100%'),
    maxWidth: '420px',
    appearance: 'auto',
  }
}

export function primaryButtonStyle(disabled) {
  return {
    height: '32px',
    padding: '0 12px',
    border: 'none',
    borderRadius: 'var(--dsw-radius-md, 8px)',
    background: 'var(--dsw-alias-button-primary-fill, #4d6bfe)',
    color: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
    font: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

export function secondaryButtonStyle(disabled) {
  return {
    height: '32px',
    padding: '0 12px',
    border: '0.5px solid var(--dsw-alias-border-l3)',
    borderRadius: 'var(--dsw-radius-md, 8px)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: '13px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

// Sidebar stats card ------------------------------------------------------------

export function statsCardStyle(wide) {
  if (!wide) {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
      minWidth: '32px',
      height: '28px',
      padding: '0 6px',
      border: '0.5px solid var(--dsw-alias-border-l3)',
      borderRadius: 'var(--dsw-radius-md, 8px)',
      background: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: '11px',
      fontWeight: 600,
      cursor: 'pointer',
      boxSizing: 'border-box',
    }
  }
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '2px',
    flex: '1 0 100%',
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    marginTop: '6px',
    marginBottom: '6px',
    padding: '6px 10px',
    border: '0.5px solid var(--dsw-alias-border-l3)',
    borderRadius: 'var(--dsw-radius-md, 8px)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: '12px',
    lineHeight: '16px',
    textAlign: 'left',
    cursor: 'pointer',
    boxSizing: 'border-box',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  }
}

export const statsRowStyle = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '12px',
  width: '100%',
  minWidth: 0,
}

export const statsLabelStyle = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
  fontWeight: 600,
  fontSize: '11px',
  lineHeight: '16px',
}

export function statsValueStyle(tone) {
  const color = tone === 'error'
    ? 'var(--dsw-alias-state-error-primary, #d93025)'
    : tone === 'off'
      ? '#f59e0b'
      : tone === 'muted'
        ? 'var(--dsw-alias-label-tertiary)'
        : 'var(--dsw-alias-label-primary)'
  return {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color,
    fontWeight: 600,
    fontSize: '11px',
    lineHeight: '16px',
  }
}

// Settings dialog ----------------------------------------------------------------

export const dialogBackdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  background: 'rgba(0, 0, 0, 0.32)',
  boxSizing: 'border-box',
  pointerEvents: 'auto',
}

export const dialogPanelStyle = {
  display: 'flex',
  flexDirection: 'column',
  width: 'min(760px, 100%)',
  minWidth: '460px',
  height: 'min(620px, 86vh)',
  minHeight: '420px',
  maxWidth: 'calc(100vw - 40px)',
  maxHeight: 'calc(100vh - 40px)',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-lg, 12px)',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.28)',
  overflow: 'hidden',
  resize: 'both',
  boxSizing: 'border-box',
}

export const dialogHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '16px 18px 10px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3)',
  cursor: 'move',
  userSelect: 'none',
  touchAction: 'none',
}

export const dialogTitleStyle = {
  margin: 0,
  fontSize: '16px',
  lineHeight: '22px',
  fontWeight: 600,
}

export const dialogSubtitleStyle = {
  margin: '3px 0 0',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  lineHeight: '18px',
}

export const dialogBodyStyle = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  padding: '14px 20px 20px',
}

export const dialogBodyTabbedStyle = {
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  padding: 0,
}

export function dialogCloseStyle() {
  return {
    marginLeft: 'auto',
    flex: 'none',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: 'var(--dsw-radius-md, 8px)',
    background: 'transparent',
    color: 'var(--dsw-alias-label-tertiary)',
    font: 'inherit',
    fontSize: '20px',
    lineHeight: '20px',
    cursor: 'pointer',
  }
}

export const tabBarStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  flex: 'none',
  maxWidth: 'calc(100% - 32px)',
  padding: '4px',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: '10px',
  background: 'var(--dsw-alias-bg-layer-2)',
  margin: '8px 16px 0',
  overflowX: 'auto',
  boxSizing: 'border-box',
}

export function tabButtonStyle(active) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flex: 'none',
    height: '32px',
    padding: '0 12px',
    border: active ? '0.5px solid var(--dsw-alias-border-l3)' : '0.5px solid transparent',
    borderRadius: '8px',
    background: active ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
    color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
    font: 'inherit',
    fontSize: '12px',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: active ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none',
    transition: 'background 120ms ease, color 120ms ease, box-shadow 120ms ease',
  }
}

export const tabIconStyle = {
  flex: 'none',
  width: '14px',
  height: '14px',
}

export const logsListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

export const logEntryStyle = {
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-md, 8px)',
  background: 'var(--dsw-alias-bg-layer-2)',
  overflow: 'hidden',
}

export const logSummaryStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  padding: '7px 10px',
  cursor: 'pointer',
  fontSize: '12px',
  lineHeight: '18px',
  listStyle: 'none',
}

export const logTimeStyle = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '11px',
  fontVariantNumeric: 'tabular-nums',
}

export const logToolStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontWeight: 600,
}

export function logDecisionStyle(blocked) {
  return {
    flex: 'none',
    fontWeight: 600,
    fontSize: '11px',
    color: blocked
      ? 'var(--dsw-alias-state-error-primary, #d93025)'
      : 'var(--dsw-alias-state-success-primary, #2ea043)',
  }
}

export const logMutedStyle = {
  flex: 'none',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '11px',
}

export const logBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '4px 10px 10px 10px',
  borderTop: '0.5px solid var(--dsw-alias-border-l3)',
}

export const logSectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
}

export const logKeyStyle = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '11px',
  fontWeight: 600,
}

export const logPreStyle = {
  margin: 0,
  padding: '6px 8px',
  borderRadius: 'var(--dsw-radius-md, 8px)',
  background: 'var(--dsw-alias-bg-layer-3)',
  color: 'var(--dsw-alias-label-primary)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '11px',
  lineHeight: '16px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '140px',
  overflow: 'auto',
}

export const logGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  gap: '2px 10px',
  fontSize: '11px',
  lineHeight: '17px',
}

export const logLabelStyle = {
  color: 'var(--dsw-alias-label-tertiary)',
}

export const inspectButtonStyle = {
  justifySelf: 'start',
  marginTop: '4px',
  padding: '3px 8px',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-sm, 6px)',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: '11px',
  cursor: 'pointer',
}

export const inspectPanelStyle = {
  display: 'flex',
  flexDirection: 'column',
  width: 'min(720px, 100%)',
  maxWidth: 'calc(100vw - 40px)',
  maxHeight: '80vh',
  border: '0.5px solid var(--dsw-alias-border-l3)',
  borderRadius: 'var(--dsw-radius-lg, 12px)',
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.32)',
  overflow: 'hidden',
}

export const inspectHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '14px 16px 10px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3)',
}

export const inspectPreStyle = {
  flex: '1 1 auto',
  minHeight: 0,
  margin: 0,
  padding: '12px 16px',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '11px',
  lineHeight: '17px',
  background: 'var(--dsw-alias-bg-layer-2)',
}

export const inspectWarningStyle = {
  margin: 0,
  padding: '8px 16px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3)',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '11px',
  lineHeight: '17px',
}

export const inspectMetaStyle = {
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  gap: '4px 12px',
  padding: '10px 16px',
  borderBottom: '0.5px solid var(--dsw-alias-border-l3)',
  fontSize: '11px',
  lineHeight: '17px',
}

export const inspectMetaLabelStyle = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontWeight: 600,
}

export const inspectMetaValueStyle = {
  minWidth: 0,
  color: 'var(--dsw-alias-label-primary)',
  wordBreak: 'break-all',
}

export const inspectContentHeaderStyle = {
  padding: '8px 16px 0',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '11px',
  fontWeight: 600,
}

export const logValueStyle = {
  color: 'var(--dsw-alias-label-primary)',
  fontVariantNumeric: 'tabular-nums',
}


