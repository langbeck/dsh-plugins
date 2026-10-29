/**
 * Session Settings — Host half.
 *
 * One authenticated Fetch route backs the Client dialog:
 *   POST /api/session-settings
 *     { sessionId, action: 'read' }
 *     { sessionId, action: 'preset', preset }
 *     { sessionId, action: 'allowlist', tools: string[] }
 *
 * It also owns the small approval answerer behind the allow-list: a listed
 * tool's `approval/request` resolves `allowed-once`, and every other request is
 * delegated to the normal human answerer. The permission catalog is the
 * Host's configured preset table; third-party plugins cannot add presets.
 */

import Schema from '@deepseek-ai/schemastery'

import { commandView, foldRecentToolCalls, mergeToolHistory, toolView } from './tools.js'

export const name = 'session-settings'

export const inject = [
  'connection',
  'approval',
  'permissionPresets',
  'sandboxPolicy',
  'commands',
  'agents',
  'sessions',
]

export const Config = Schema.object({
  defaultAllowedTools: Schema.array(Schema.string()).default([]),
})

const ROUTE = '/api/session-settings'
const MAX_TOOLS = 64
const MAX_TOOL_NAME = 128
const RECENT_CALLS = 8

export function apply(ctx, config) {
  const defaults = sanitizeTools(config !== null && config !== undefined ? config.defaultAllowedTools : undefined)
  const sessionAllowLists = new Map()
  const sessionBlockLists = new Map()

  function queryService() {
    try {
      return ctx.get('sessionQuery')
    } catch (error) {
      return undefined
    }
  }

  function sessionOf(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') throw new Error('sessionId is required')
    const session = ctx.sessions.get(sessionId)
    if (session === undefined) throw new Error('Session is not loaded: ' + sessionId)
    return session
  }

  function effectiveAllow(sessionId) {
    const tools = new Set(defaults)
    for (const tool of sessionAllowLists.get(sessionId) ?? []) tools.add(tool)
    return Array.from(tools)
  }

  function toolSchemas(session) {
    let header
    try {
      header = session.requestHeader()
    } catch (error) {
      header = undefined
    }
    if (header !== undefined && header !== null && Array.isArray(header.tools) && header.tools.length > 0) {
      return header.tools.map(toolView).filter(Boolean)
    }
    try {
      return mergeToolHistory(session.toolHistory()).map(toolView).filter(Boolean)
    } catch (error) {
      return []
    }
  }

  function commandDescriptors(sessionId) {
    const agent = ctx.agents.get(sessionId)
    if (agent === undefined) return []
    try {
      return ctx.commands.list(agent).map(commandView).filter(Boolean)
    } catch (error) {
      return []
    }
  }

  async function recentCalls(session) {
    const query = queryService()
    if (query === undefined) return []
    let observation
    try {
      observation = await query.observeSession(session.id, { projectionMode: 'none' })
      const inherited = typeof session.inheritedEventCount === 'number' ? session.inheritedEventCount : 0
      return foldRecentToolCalls(observation.events, inherited, RECENT_CALLS)
    } catch (error) {
      return []
    } finally {
      if (observation !== undefined) {
        try {
          if (typeof observation[Symbol.dispose] === 'function') observation[Symbol.dispose]()
          else if (typeof observation.dispose === 'function') observation.dispose()
        } catch (error) {}
      }
    }
  }

  async function snapshot(sessionId) {
    const session = sessionOf(sessionId)
    const catalog = ctx.permissionPresets.catalog()
    const current = ctx.permissionPresets.current(session)
    const sandbox = readSandbox(ctx, session)
    const approval = readApproval(ctx, session)
    const calls = await recentCalls(session)
    const tools = toolSchemas(session)
    const recentByTool = new Map()
    for (const call of calls) {
      const list = recentByTool.get(call.name) ?? []
      if (list.length < 3) list.push(call)
      recentByTool.set(call.name, list)
    }
    return {
      sessionId,
      live: ctx.agents.get(sessionId) !== undefined,
      preset: {
        current,
        catalog: catalog.options.map((option) => ({
          value: option.value,
          name: option.name,
          description: option.description,
        })),
      },
      knobs: { sandbox, approval },
      tools: tools.map((tool) => ({ ...tool, recentCalls: recentByTool.get(tool.name) ?? [] })),
      commands: commandDescriptors(sessionId),
      allowList: {
        configured: defaults,
        session: Array.from(sessionAllowLists.get(sessionId) ?? []),
        effective: effectiveAllow(sessionId),
      },
      blockList: {
        session: Array.from(sessionBlockLists.get(sessionId) ?? []),
      },
      persistence: 'memory',
    }
  }

  async function handle(body) {
    const sessionId = body !== null && typeof body === 'object' ? body.sessionId : undefined
    const action = body !== null && typeof body === 'object' ? body.action : undefined
    if (action === 'read') return snapshot(sessionId)
    if (action === 'preset') {
      const session = sessionOf(sessionId)
      const name = body.preset
      if (typeof name !== 'string' || name === '') throw new Error('preset is required')
      const catalog = ctx.permissionPresets.catalog()
      if (!catalog.options.some((option) => option.value === name)) throw new Error('Unknown permission preset: ' + name)
      ctx.permissionPresets.set(session, name)
      return snapshot(sessionId)
    }
    if (action === 'policies') {
      sessionOf(sessionId)
      const blocked = new Set(sanitizeTools(body.block))
      const allowed = sanitizeTools(body.allow).filter((tool) => !blocked.has(tool))
      if (allowed.length === 0) sessionAllowLists.delete(sessionId)
      else sessionAllowLists.set(sessionId, allowed)
      if (blocked.size === 0) sessionBlockLists.delete(sessionId)
      else sessionBlockLists.set(sessionId, Array.from(blocked))
      return snapshot(sessionId)
    }
    throw new Error('Unknown action: ' + String(action))
  }

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await request.json()
          const value = await handle(body)
          return Response.json({ ok: true, value })
        } catch (error) {
          return Response.json({ ok: false, error: { code: 'session-settings-failed', message: describeError(error) } })
        }
      },
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'session-settings: route')

  ctx.effect(() => ctx.on('approval/request', (request, next) => {
    if (request === null || request === undefined || typeof request.toolName !== 'string') return next()
    const sessionId = request.agent !== null && request.agent !== undefined ? request.agent.id : undefined
    if (typeof sessionId !== 'string') return next()
    if ((sessionBlockLists.get(sessionId) ?? []).includes(request.toolName)) return 'rejected'
    return effectiveAllow(sessionId).includes(request.toolName) ? 'allowed-once' : next()
  }, true), 'session-settings: approval allow-list')
}

/** Normalize a tool allow-list: strings only, unique, bounded. */
export function sanitizeTools(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const name = entry.trim()
    if (name === '' || name.length > MAX_TOOL_NAME) continue
    seen.add(name)
    if (seen.size >= MAX_TOOLS) break
  }
  return Array.from(seen)
}

function readSandbox(ctx, session) {
  try {
    return ctx.sandboxPolicy.resolve({ session }).mode
  } catch (error) {
    return undefined
  }
}

function readApproval(ctx, session) {
  try {
    return ctx.approval.overrideOf(session) ?? 'ask'
  } catch (error) {
    return 'ask'
  }
}

function describeError(error) {
  if (error === null || error === undefined) return 'unknown error'
  if (typeof error === 'string') return error
  if (typeof error.message === 'string' && error.message !== '') return error.message
  return String(error)
}
