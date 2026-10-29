/** Turn one DSH tool execution into the firewall's normalized input. */

const COMMAND_KEYS = ['command', 'code', 'script']
const GENERIC_TEXT_KEYS = ['command', 'code', 'script', 'input', 'query', 'url', 'path', 'file_path', 'pattern', 'glob', 'cmd']
const SKIP_KEYS = new Set(['content', 'old_string', 'new_string', 'text', 'body'])

function canonicalJson(value) {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return ''
  }
}

function stringValue(record, key) {
  if (record === null || typeof record !== 'object') return undefined
  const value = record[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function definitionOf(tools, exec) {
  if (tools === undefined || tools === null || typeof tools.get !== 'function') return undefined
  try {
    return tools.get(exec.name, exec.agent)
  } catch (error) {
    return undefined
  }
}

/** Extract the command, model-supplied description, and diagnostic JSON for one call. */
export function extractToolPayload(exec, tools, config) {
  const args = exec.arguments !== null && typeof exec.arguments === 'object' ? exec.arguments : {}
  const definition = definitionOf(tools, exec)
  const shell = Array.isArray(config.shellTools) && config.shellTools.includes(exec.name)
  const limit = Number.isFinite(config.maxCommandChars) ? config.maxCommandChars : 8192
  const argumentsJson = canonicalJson(args).slice(0, limit)
  let command
  let description
  if (shell) {
    for (const key of COMMAND_KEYS) {
      const value = stringValue(args, key)
      if (value !== undefined) {
        command = value
        break
      }
    }
    if (command === undefined) command = argumentsJson
    description = stringValue(args, 'description') ?? null
  } else {
    const parts = []
    for (const key of GENERIC_TEXT_KEYS) {
      if (SKIP_KEYS.has(key)) continue
      const value = stringValue(args, key)
      if (value !== undefined) parts.push(value)
    }
    command = parts.join('\n')
  }
  return {
    name: exec.name,
    kind: shell ? 'shell' : 'generic',
    shell,
    command: (command ?? '').slice(0, limit),
    description: typeof description === 'string' ? description.slice(0, limit) : null,
    argumentsJson,
    toolDescription: typeof definition?.description === 'string' ? definition.description : '',
  }
}
