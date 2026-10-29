/**
 * Balance — Host half (Cordis plugin).
 *
 * Owns the row's Config schema, the OpenRouter pricing cache, the Session-cost
 * fold, and the Session cost cap. The Client reads the account balance itself;
 * the Host exposes cost and cap data over the authenticated Connection exact
 * Fetch route `/api/balance-session-cost` (owner peer only).
 *
 * Other Host plugins consume the `balanceCost` service:
 *   read(sessionId, signal) -> cost snapshot + limitUsd/remainingUsd
 *   limitOf(sessionId), setLimit(sessionId, limitUsd | null), pricingState()
 *
 * `/limit <usd>`, `/limit off`, and `/limit` manage the current Session cap.
 * A pre-step guard pauses an over-cap turn and asks whether to proceed once or
 * cancel.
 */

import Schema from '@deepseek-ai/schemastery'

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

  function limitOf(sessionId) {
    return sessionLimits.get(sessionId) ?? null
  }

  function setLimit(sessionId, value) {
    if (value === null || value === undefined || value === '') {
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
      const limitUsd = limitOf(sessionId)
      return {
        ...value,
        limitUsd,
        remainingUsd: limitUsd === null ? null : Math.max(0, limitUsd - value.totalUsd),
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
    handler: ({ agent, rawInput }) => {
      const text = typeof rawInput === 'string' ? rawInput.trim() : ''
      if (text === '') {
        const limit = limitOf(agent.id)
        return {
          kind: 'success',
          text: limit === null ? 'No Session cost cap is set.' : 'Session cost cap: $' + limit.toFixed(2),
        }
      }
      if (text === 'off' || text === 'clear' || text === 'none') {
        setLimit(agent.id, null)
        return { kind: 'success', text: 'Session cost cap cleared.' }
      }
      const value = Number(text.replace(/^\$/, ''))
      if (!Number.isFinite(value) || value <= 0) {
        return { kind: 'error', text: 'Usage: /limit <usd>, /limit off, or /limit' }
      }
      try {
        const limit = setLimit(agent.id, value)
        return { kind: 'success', text: 'Session cost cap set to $' + limit.toFixed(2) + '.' }
      } catch (error) {
        return { kind: 'error', text: describeError(error) }
      }
    },
  }), 'balance: limit command')

  ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
    const sessionId = payload.agent.session.id
    const limit = limitOf(sessionId)
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
    let answer
    try {
      answer = await questions.ask({
        agent: payload.agent,
        signal: payload.signal,
        questions: [{
          id: 'cost-cap',
          header: 'Session cost cap',
          question: 'This Session has reached its $' + limit.toFixed(2) + ' cost cap (current estimate $' + cost.totalUsd.toFixed(2) + '). Continue this turn?',
          options: [{ label: 'Proceed once' }, { label: 'Cancel' }],
        }],
      })
    } catch (error) {
      return { kind: 'reject' }
    }
    const selected = answer !== null && answer !== undefined && Array.isArray(answer.answers) && Array.isArray(answer.answers[0]?.selected)
      ? answer.answers[0].selected[0]
      : undefined
    if (selected === 'Proceed once') {
      limitApprovedTurns.set(sessionId, payload.turn)
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
