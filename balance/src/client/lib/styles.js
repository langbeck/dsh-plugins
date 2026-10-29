/** Inline styles: nothing to register, dispose, or leak into the page. */

export const rowStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '6px',
  minWidth: 0,
  width: '100%',
}

export const rowLabelStyle = {
  flex: '0 0 52px',
  width: '52px',
  fontWeight: 600,
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '11px',
  lineHeight: '16px',
}

export const contentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: '1 1 auto',
  minWidth: 0,
}

export const walletStyle = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '3px',
  minWidth: 0,
}

export const amountStyle = {
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
}

export const codeStyle = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.02em',
}

export const timeStyle = {
  flex: 'none',
  alignSelf: 'center',
  marginLeft: '4px',
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '10px',
  lineHeight: '16px',
  fontVariantNumeric: 'tabular-nums',
}

export function remainingStyle(remainingUsd) {
  return {
    color: remainingUsd > 0
      ? 'var(--dsw-alias-state-success-primary, #2ea043)'
      : 'var(--dsw-alias-state-error-primary, #d93025)',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '16px',
    fontVariantNumeric: 'tabular-nums',
  }
}

export function separatorStyle(wide) {
  return {
    display: wide ? 'inline' : 'none',
    color: 'var(--dsw-alias-label-tertiary)',
    fontWeight: 400,
    margin: '0 1px',
  }
}

/** The full-width block in the wrapped sidebar footer. */
export function pillStyle(wide) {
  if (!wide) {
    return {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0px',
      flex: 'none',
      minWidth: 0,
      maxWidth: '100%',
      padding: '0',
      border: 'none',
      borderRadius: 0,
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      fontSize: '10px',
      lineHeight: '12px',
      marginTop: '2px',
      marginBottom: '2px',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }
  }
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '4px',
    flex: '1 0 100%',
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    minHeight: '40px',
    marginTop: '6px',
    marginBottom: '6px',
    padding: '6px 10px',
    border: '0.5px solid var(--dsw-alias-border-l3)',
    borderRadius: 'var(--dsw-radius-md, 8px)',
    background: 'var(--dsw-alias-bg-layer-1)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px',
    lineHeight: '16px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    boxSizing: 'border-box',
  }
}

// Settings form -----------------------------------------------------------------

export const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  fontSize: '13px',
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
  padding: '8px 0',
}

export const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  maxWidth: '280px',
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

export function inputStyle(disabled) {
  return {
    boxSizing: 'border-box',
    width: '96px',
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
