/**
 * Balance — Host half (Cordis plugin).
 *
 * Owns the row's Config schema, the OpenRouter pricing cache, the Session-cost
 * fold, and the Session cost cap. Limits persist through a small
 * `storageDomain` sidecar keyed by Session id, with an in-memory fallback.
 *
 * Other Host plugins consume the `balanceCost` service:
 *   read(sessionId, signal) -> cost snapshot + limitUsd/remainingUsd
 *   limitOf(sessionId), setLimit(sessionId, limitUsd | null), pricingState()
 *
 * `/limit <usd>`, `/limit off`, and `/limit` manage the current Session cap.
 * A pre-step guard pauses an over-cap turn and asks whether to proceed once,
 * increase the cap, or cancel.
 */

import Schema from '@deepseek-ai/schemastery'

import { LIMITS_DOMAIN } from './host/limits.js'
import { createPricing } from './host/pricing.js'
import { readSessionCost } from './host/session-cost.js'
import { describeError } from './host/util.js'

export const name = 'balance'

export const inject = ['connection', 'commands']

export const Config = Schema.object({
  refreshSeconds: Schema.number().min(0).max(3600).step(1).default(60),
  showZeroBalances: Schema.boolean().default(true),
  showCurrencyName: Schema.boolean().default(true),
  pricingRefreshSeconds: Schema.number().min(60).max(86400).step(1).default(3600),
})

const COST_ROUTE = '/api/balance-session-cost'
const EVENTS_ROUTE = '/api/balance-events'
const MAX_COST_LIMIT_USD = 1_000_000

export function apply(ctx, config) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  const interval = Number.isFinite(settings.pricingRefreshSeconds) && settings.pricingRefreshSeconds >= 60
    ? Math.round(settings.pricingRefreshSeconds)
    : 3600
  const pricing = createPricing(interval)
  const costCache = new Map()
  const catalogCache = new Map()
  const sessionLimits = new Map()
  const limitApprovedTurns = new Map()
  const eventListeners = new Set()

  let limitsDomain
  let limitsTable
  let limitsReady
  let limitsClosed = false

  function notifyLimit(sessionId, limitUsd) {
    for (const listener of Array.from(eventListeners)) {
      if (listener.sessionId !== sessionId) continue
      listener.send({ type: 'limit', sessionId, limitUsd })
    }
  }

  function questionService() {
    try {
      return ctx.get('userQuestions')
    } catch (error) {
      return undefined
    }
  }

  async function ensureLimits() {
    if (limitsReady !== undefined) return limitsReady
    limitsReady = (async () => {
      let storage
      try {
        storage = ctx.get('storageDomain')
      } catch (error) {
        return false
      }
      if (storage === undefined) return false
      let domain
      try {
        domain = await storage.open(LIMITS_DOMAIN)
      } catch (error) {
        // A rapid plugin reload can race the previous instance's async close.
        if (error !== null && error !== undefined && error.code === 'already-open') {
          await new Promise((resolve) => setTimeout(resolve, 50))
          try {
            domain = await storage.open(LIMITS_DOMAIN)
          } catch (retryError) {
            return false
          }
        } else {
          return false
        }
      }
      if (limitsClosed) {
        try {
          await domain.close()
        } catch (error) {}
        return false
      }
      limitsDomain = domain
      limitsTable = domain.table('session_limits')
      for (const [sessionId, record] of limitsTable.entries()) {
        if (record !== null && typeof record.limitUsd === 'number' && Number.isFinite(record.limitUsd) && record.limitUsd > 0) {
          sessionLimits.set(sessionId, record.limitUsd)
        }
      }
      return true
    })()
    return limitsReady
  }

  void ensureLimits()

  ctx.effect(() => () => {
    limitsClosed = true
    const domain = limitsDomain
    if (domain !== undefined) return domain.close()
  }, 'balance: limits storage')

  async function limitOf(sessionId) {
    await ensureLimits()
    return sessionLimits.get(sessionId) ?? null
  }

  async function setLimit(sessionId, value) {
    await ensureLimits()
    if (value === null || value === undefined || value === '') {
      if (limitsTable !== undefined) {
        try {
          await limitsTable.delete(sessionId)
        } catch (error) {
          throw new Error('Could not clear the cost cap: ' + describeError(error))
        }
      }
      sessionLimits.delete(sessionId)
      limitApprovedTurns.delete(sessionId)
      notifyLimit(sessionId, null)
      return null
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_COST_LIMIT_USD) {
      throw new Error('Cost cap must be a positive USD amount')
    }
    const rounded = Math.round(numeric * 100) / 100
    if (rounded <= 0) throw new Error('Cost cap must be at least $0.01')
    if (limitsTable !== undefined) {
      try {
        await limitsTable.put(sessionId, { limitUsd: rounded, updatedAt: Date.now() })
      } catch (error) {
        throw new Error('Could not save the cost cap: ' + describeError(error))
      }
    }
    sessionLimits.set(sessionId, rounded)
    limitApprovedTurns.delete(sessionId)
    notifyLimit(sessionId, rounded)
    return rounded
  }

  // Other Host plugins read and configure Session cost through this service;
  // the browser route below remains the Client-facing transport.
  const costService = {
    async read(sessionId, signal) {
      const value = await readSessionCost(ctx, pricing, catalogCache, costCache, { sessionId }, signal)
      const limitUsd = await limitOf(sessionId)
      return {
        ...value,
        limitUsd,
        remainingUsd: limitUsd === null ? null : Math.max(0, limitUsd - value.totalUsd),
        limitPersistence: limitsTable === undefined ? 'memory' : 'durable',
      }
    },
    limitOf,
    setLimit,
    pricingState() {
      return pricing.state()
    },
  }

  ctx.effect(() => {
    const dispose = ctx.provide('balanceCost', costService)
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'balance: cost service')

  ctx.effect(() => {
    pricing.start()
    return () => pricing.dispose()
  }, 'balance: pricing')

  ctx.effect(() => ctx.commands.register({
    name: 'limit',
    description: 'Set or clear the cost cap for the current Session.',
    input: { hint: '<usd|off>' },
    handler: async ({ agent, rawInput }) => {
      const text = typeof rawInput === 'string' ? rawInput.trim() : ''
      if (text === '') {
        const limit = await limitOf(agent.id)
        return {
          kind: 'success',
          text: limit === null ? 'No Session cost cap is set.' : 'Session cost cap: $' + limit.toFixed(2),
        }
      }
      if (text === 'off' || text === 'clear' || text === 'none') {
        try {
          await setLimit(agent.id, null)
          return { kind: 'success', text: 'Session cost cap cleared.' }
        } catch (error) {
          return { kind: 'error', text: describeError(error) }
        }
      }
      const value = Number(text.replace(/^\$/, ''))
      if (!Number.isFinite(value) || value <= 0) {
        return { kind: 'error', text: 'Usage: /limit <usd>, /limit off, or /limit' }
      }
      try {
        const limit = await setLimit(agent.id, value)
        return { kind: 'success', text: 'Session cost cap set to $' + limit.toFixed(2) + '.' }
      } catch (error) {
        return { kind: 'error', text: describeError(error) }
      }
    },
  }), 'balance: limit command')

  ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
    const sessionId = payload.agent.session.id
    const limit = await limitOf(sessionId)
    if (limit === null) return next()
    if (limitApprovedTurns.get(sessionId) === payload.turn) return next()
    let cost
    try {
      cost = await costService.read(sessionId, payload.signal)
    } catch (error) {
      return next()
    }
    if (!(typeof cost.totalUsd === 'number' && cost.totalUsd >= limit)) return next()
    const questions = questionService()
    if (questions === undefined || typeof questions.ask !== 'function') return { kind: 'reject' }
    const ask = async (questionsBatch) => questions.ask({
      agent: payload.agent,
      signal: payload.signal,
      questions: questionsBatch,
    })
    let answer
    try {
      answer = await ask([{
        id: 'cost-cap',
        header: 'Session cost cap',
        question: 'This Session has reached its $' + limit.toFixed(2) + ' cost cap (current estimate $' + cost.totalUsd.toFixed(2) + '). Continue this turn?',
        options: [{ label: 'Allow turn' }, { label: 'Increase limit' }, { label: 'Cancel' }],
      }])
    } catch (error) {
      return { kind: 'reject' }
    }
    const selected = answer !== null && answer !== undefined && Array.isArray(answer.answers) && Array.isArray(answer.answers[0]?.selected)
      ? answer.answers[0].selected[0]
      : undefined
    if (selected === 'Allow turn') {
      limitApprovedTurns.set(sessionId, payload.turn)
      return next()
    }
    if (selected === 'Increase limit') {
      const choices = increaseChoices(limit)
      let amountAnswer
      try {
        amountAnswer = await ask([{
          id: 'cost-cap-amount',
          header: 'Session cost cap',
          question: 'Choose a new Session cap.',
          detail: 'Current cap ' + usd(limit) + '; current estimate ' + usd(cost.totalUsd) + '.',
          options: choices.map((value) => ({
            label: usd(value),
            description: '+' + usd(value - limit),
          })).concat([{ label: 'Cancel' }]),
        }])
      } catch (error) {
        return { kind: 'reject' }
      }
      const amountItem = amountAnswer !== null && amountAnswer !== undefined && Array.isArray(amountAnswer.answers)
        ? amountAnswer.answers[0]
        : undefined
      const chosen = amountItem !== undefined && Array.isArray(amountItem.selected) ? amountItem.selected[0] : undefined
      if (chosen === 'Cancel') return { kind: 'reject' }
      const raw = amountItem !== undefined && typeof amountItem.custom === 'string' && amountItem.custom.trim() !== ''
        ? amountItem.custom
        : chosen
      const match = typeof raw === 'string' ? /([0-9]+(?:\.[0-9]+)?)/.exec(raw) : null
      if (match === null) return { kind: 'reject' }
      try {
        await setLimit(sessionId, Number(match[1]))
      } catch (error) {
        return { kind: 'reject' }
      }
      return next()
    }
    return { kind: 'reject' }
  }), 'balance: cost cap')

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: EVENTS_ROUTE,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const sessionId = new URL(request.url).searchParams.get('sessionId') ?? ''
        const encoder = new TextEncoder()
        let closeStream = () => {}
        const stream = new ReadableStream({
          start(controller) {
            let timer
            let closed = false
            let entry
            const close = () => {
              if (closed) return
              closed = true
              clearInterval(timer)
              eventListeners.delete(entry)
              try {
                controller.close()
              } catch (error) {}
            }
            closeStream = close
            entry = {
              sessionId,
              close,
              send(value) {
                if (closed) return
                try {
                  controller.enqueue(encoder.encode('data: ' + JSON.stringify(value) + '\n\n'))
                } catch (error) {
                  close()
                }
              },
            }
            eventListeners.add(entry)
            timer = setInterval(() => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(': keepalive\n\n'))
              } catch (error) {
                close()
              }
            }, 25_000)
            entry.send({ type: 'ready' })
            if (request.signal.aborted) close()
            else request.signal.addEventListener('abort', close, { once: true })
          },
          cancel() {
            closeStream()
          },
        })
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        })
      },
    })
    return () => {
      for (const entry of Array.from(eventListeners)) entry.close()
      eventListeners.clear()
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'balance: cost events')

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: COST_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await request.json()
          const value = await costService.read(payload.sessionId, request.signal)
          return Response.json({ ok: true, value })
        } catch (error) {
          return Response.json({ ok: false, error: { code: 'session-cost-failed', message: describeError(error), details: {} } })
        }
      },
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'balance: session-cost route')
}

function usd(value) {
  return '$' + value.toFixed(2)
}

function increaseChoices(limit) {
  const values = [limit + 1, limit + 5, limit + 10, limit * 2]
    .map((value) => Math.round(value * 100) / 100)
    .filter((value) => value > limit)
  return Array.from(new Set(values))
}
