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
  padding: '12px 0 0',
  borderTop: '0.5px solid var(--dsw-alias-border-l3)',
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
    ...inputStyle(disabled, '180px'),
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
