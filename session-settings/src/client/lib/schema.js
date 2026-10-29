/** Pure helpers for turning a tool's parameter JSON Schema into form rows. */

/**
 * Flatten one parameter schema into ordered fields. Object properties recurse;
 * other roots render as a single `value` field.
 */
export function collectSchemaFields(schema) {
  if (schema === null || typeof schema !== 'object') return []
  const rows = []
  if (schema.type === 'object' && schema.properties !== undefined && schema.properties !== null && typeof schema.properties === 'object') {
    walkObject(schema, 0, '', rows)
    return rows
  }
  rows.push({ name: 'value', path: 'value', schema, required: false, depth: 0, typeLabel: schemaTypeLabel(schema) })
  return rows
}

function walkObject(schema, depth, prefix, out) {
  const properties = schema.properties !== null && typeof schema.properties === 'object' ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((name) => typeof name === 'string') : [])
  for (const [name, child] of Object.entries(properties)) {
    if (child === null || typeof child !== 'object') continue
    const path = prefix === '' ? name : prefix + '.' + name
    out.push({
      name,
      path,
      schema: child,
      required: required.has(name),
      depth,
      typeLabel: schemaTypeLabel(child),
    })
    if (child.type === 'object' && child.properties !== undefined && child.properties !== null) {
      walkObject(child, depth + 1, path, out)
    }
  }
}

/** Compact one-line type label for a schema node. */
export function schemaTypeLabel(schema) {
  if (schema === null || typeof schema !== 'object') return 'any'
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return 'oneOf(' + schema.oneOf.length + ')'
  if (schema.const !== undefined) return 'const ' + JSON.stringify(schema.const)
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return 'enum(' + schema.enum.length + ')'
  if (Array.isArray(schema.type)) return schema.type.join(' | ')
  if (schema.type === 'array') return 'array<' + schemaTypeLabel(schema.items) + '>'
  if (schema.type === 'object') return 'object'
  if (typeof schema.type === 'string') return schema.type
  if (schema.properties !== undefined) return 'object'
  return 'any'
}

/** JSON-safe default/example hint for a field, or undefined. */
export function schemaDefaultHint(schema) {
  if (schema === null || typeof schema !== 'object') return undefined
  if (schema.default !== undefined) return 'default: ' + jsonText(schema.default)
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return 'example: ' + jsonText(schema.examples[0])
  return undefined
}

function jsonText(value) {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return String(value)
  }
}
