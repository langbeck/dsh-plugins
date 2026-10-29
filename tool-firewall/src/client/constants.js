/** Shared constants for the tool firewall Client half. */

import { DEFAULT_CONFIG } from '../config.js'

export const NS = 'toolFirewall'
export const PACKAGE = 'dsh-plugin-tool-firewall'
export const ROW_ID = 'tool-firewall'
export const CONFIG_KEY = `${PACKAGE}#${ROW_ID}`
export const INJECT = ['slots', 'locale', 'configForms']
export { DEFAULT_CONFIG }
