/**
 * Balance — Host half (Cordis plugin).
 *
 * Owns the row's Config schema, the OpenRouter pricing cache, the Session-cost
 * fold, and the Session cost cap. Limits persist through a small
 * `storageDomain` sidecar keyed by Session id, with an in-memory fallback.
 *
 * Other Host plugins consume the `balanceCost` service:
 *   read(sessionId, signal) -> cost snapshot + limitUsd/remainingUsd + turnLimitUsd
 *   limitOf(sessionId), setLimit(sessionId, limitUsd | null),
 *   turnLimitOf(sessionId), setTurnLimit(sessionId, limitUsd | null),
 *   pricingState()
 *
 * `/session-limit` and `/turn-limit` manage the current Session cap and the
 * per-turn budget. A pre-step guard pauses an over-budget turn and asks how to
 * proceed.
 */

import Schema from '@deepseek-ai/schemastery'

import { LIMITS_DOMAIN, TURN_LIMITS_DOMAIN } from './host/limits.js'
import { createPricing } from './host/pricing.js'
import { readSessionCost } from './host/session-cost.js'
import { describeError } from './host/util.js'

export const name = 'balance'

export const inject = ['connection']

export const Config = Schema.object({
  refreshSeconds: Schema.number().min(0).max(3600).step(1).default(60),
  showZeroBalances: Schema.boolean().default(true),
  showCurrencyName: Schema.boolean().default(true),
  pricingRefreshSeconds: Schema.number().min(60).max(86400).step(1).default(3600),
})

const COST_ROUTE = '/api/balance-session-cost'
const LIMIT_ROUTE = '/api/balance-limit'
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
  const turnLimits = new Map()
  const limitApprovedTurns = new Map()
  const turnStarts = new Map()
  const turnApprovedSteps = new Map()
  const eventListeners = new Set()

  let limitsDomain
  let limitsTable
  let limitsReady
  let limitsClosed = false
  let turnLimitsDomain
  let turnLimitsTable
  let turnLimitsReady
  let turnLimitsClosed = false

  function notifyLimit(sessionId, limitUsd) {
    for (const listener of Array.from(eventListeners)) {
      if (listener.sessionId !== sessionId) continue
      listener.send({ type: 'limit', sessionId, limitUsd })
    }
  }

  function notifyTurnLimit(sessionId, turnLimitUsd) {
    for (const listener of Array.from(eventListeners)) {
      if (listener.sessionId !== sessionId) continue
      listener.send({ type: 'limit', sessionId, turnLimitUsd })
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

  async function ensureTurnLimits() {
    if (turnLimitsReady !== undefined) return turnLimitsReady
    turnLimitsReady = (async () => {
      let storage
      try {
        storage = ctx.get('storageDomain')
      } catch (error) {
        return false
      }
      if (storage === undefined) return false
      let domain
      try {
        domain = await storage.open(TURN_LIMITS_DOMAIN)
      } catch (error) {
        if (error !== null && error !== undefined && error.code === 'already-open') {
          await new Promise((resolve) => setTimeout(resolve, 50))
          try {
            domain = await storage.open(TURN_LIMITS_DOMAIN)
          } catch (retryError) {
            return false
          }
        } else {
          return false
        }
      }
      if (turnLimitsClosed) {
        try {
          await domain.close()
        } catch (error) {}
        return false
      }
      turnLimitsDomain = domain
      turnLimitsTable = domain.table('session_turn_limits')
      for (const [sessionId, record] of turnLimitsTable.entries()) {
        if (record !== null && typeof record.limitUsd === 'number' && Number.isFinite(record.limitUsd) && record.limitUsd > 0) {
          turnLimits.set(sessionId, record.limitUsd)
        }
      }
      return true
    })()
    return turnLimitsReady
  }

  void ensureTurnLimits()

  ctx.effect(() => () => {
    limitsClosed = true
    turnLimitsClosed = true
    const closeLimits = limitsDomain === undefined ? undefined : limitsDomain.close()
    const closeTurn = turnLimitsDomain === undefined ? undefined : turnLimitsDomain.close()
    if (closeLimits !== undefined && closeTurn !== undefined) return Promise.allSettled([closeLimits, closeTurn])
    return closeLimits ?? closeTurn
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


  async function turnLimitOf(sessionId) {
    await ensureTurnLimits()
    return turnLimits.get(sessionId) ?? null
  }

  async function setTurnLimit(sessionId, value) {
    await ensureTurnLimits()
    if (value === null || value === undefined || value === '') {
      if (turnLimitsTable !== undefined) {
        try {
          await turnLimitsTable.delete(sessionId)
        } catch (error) {
          throw new Error('Could not clear the turn cap: ' + describeError(error))
        }
      }
      turnLimits.delete(sessionId)
      turnStarts.delete(sessionId)
      turnApprovedSteps.delete(sessionId)
      notifyTurnLimit(sessionId, null)
      return null
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > MAX_COST_LIMIT_USD) {
      throw new Error('Turn cap must be a positive USD amount')
    }
    const rounded = Math.round(numeric * 100) / 100
    if (rounded <= 0) throw new Error('Turn cap must be at least $0.01')
    if (turnLimitsTable !== undefined) {
      try {
        await turnLimitsTable.put(sessionId, { limitUsd: rounded, updatedAt: Date.now() })
      } catch (error) {
        throw new Error('Could not save the turn cap: ' + describeError(error))
      }
    }
    turnLimits.set(sessionId, rounded)
    turnApprovedSteps.delete(sessionId)
    notifyTurnLimit(sessionId, rounded)
    return rounded
  }


  async function runLimitCommand(scope, agent, rawInput) {
    const text = typeof rawInput === 'string' ? rawInput.trim() : ''
    const isTurn = scope === 'turn'
    const label = isTurn ? 'Turn cost cap' : 'Session cost cap'
    const current = isTurn ? await turnLimitOf(agent.id) : await limitOf(agent.id)
    if (text === '') {
      return {
        kind: 'success',
        text: current === null ? 'No ' + label.toLowerCase() + ' is set.' : label + ': $' + current.toFixed(2),
      }
    }
    if (text === 'off' || text === 'clear' || text === 'none') {
      try {
        if (isTurn) await setTurnLimit(agent.id, null)
        else await setLimit(agent.id, null)
        return { kind: 'success', text: label + ' cleared.' }
      } catch (error) {
        return { kind: 'error', text: describeError(error) }
      }
    }
    const parsed = parseLimitInput(text)
    if (parsed === undefined) {
      const usage = isTurn ? '/turn-limit' : '/session-limit'
      return { kind: 'error', text: 'Usage: ' + usage + ' <usd|+usd|-usd|off>, or ' + usage }
    }
    let next
    if (parsed.relative) {
      if (current === null && parsed.sign < 0) {
        return { kind: 'error', text: 'No ' + label.toLowerCase() + ' is set to decrease.' }
      }
      next = (current ?? 0) + parsed.sign * parsed.amount
    } else {
      next = parsed.amount
    }
    if (!Number.isFinite(next) || next <= 0) {
      return { kind: 'error', text: label + ' must be a positive USD amount.' }
    }
    try {
      const saved = isTurn ? await setTurnLimit(agent.id, next) : await setLimit(agent.id, next)
      if (parsed.relative) {
        const direction = parsed.sign > 0 ? 'increased' : 'reduced'
        return { kind: 'success', text: label + ' ' + direction + ' by $' + parsed.amount.toFixed(2) + ' to $' + saved.toFixed(2) + '.' }
      }
      return { kind: 'success', text: label + ' set to $' + saved.toFixed(2) + '.' }
    } catch (error) {
      return { kind: 'error', text: describeError(error) }
    }
  }

  // Other Host plugins read and configure Session cost through this service;
  // the browser route below remains the Client-facing transport.
  const costService = {
    async read(sessionId, signal) {
      const value = await readSessionCost(ctx, pricing, catalogCache, costCache, { sessionId }, signal)
      const limitUsd = await limitOf(sessionId)
      const turnLimitUsd = await turnLimitOf(sessionId)
      const turnState = turnStarts.get(sessionId)
      const turnSpentUsd = turnState === undefined ? null : Math.max(0, value.totalUsd - turnState.startUsd)
      const turnRemainingUsd = turnLimitUsd === null || turnSpentUsd === null ? null : turnLimitUsd - turnSpentUsd
      return {
        ...value,
        limitUsd,
        remainingUsd: limitUsd === null ? null : limitUsd - value.totalUsd,
        turnLimitUsd,
        turnSpentUsd,
        turnRemainingUsd,
        limitPersistence: limitsTable === undefined ? 'memory' : 'durable',
        turnLimitPersistence: turnLimitsTable === undefined ? 'memory' : 'durable',
      }
    },
    limitOf,
    setLimit,
    turnLimitOf,
    setTurnLimit,
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


  ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
    const sessionId = payload.agent.session.id
    const [limit, turnLimit] = await Promise.all([limitOf(sessionId), turnLimitOf(sessionId)])
    if (limit === null && turnLimit === null) return next()
    let cost
    try {
      cost = await costService.read(sessionId, payload.signal)
    } catch (error) {
      return next()
    }
    const total = typeof cost.totalUsd === 'number' && Number.isFinite(cost.totalUsd) ? cost.totalUsd : 0
    const questions = questionService()
    const ask = async (questionsBatch) => questions.ask({
      agent: payload.agent,
      signal: payload.signal,
      questions: questionsBatch,
    })

    if (turnLimit !== null) {
      const prior = turnStarts.get(sessionId)
      if (prior === undefined || prior.turn !== payload.turn) {
        turnStarts.set(sessionId, { turn: payload.turn, startUsd: total })
        turnApprovedSteps.delete(sessionId)
      } else {
        const turnSpent = Math.max(0, total - prior.startUsd)
        const approvalKey = String(payload.turn) + ':' + String(payload.step)
        if (turnSpent >= turnLimit && turnApprovedSteps.get(sessionId) !== approvalKey) {
          if (questions === undefined || typeof questions.ask !== 'function') return { kind: 'reject' }
          let answer
          try {
            answer = await ask([{
              id: 'turn-cost-cap',
              header: 'Turn cost cap',
              question: 'This turn has spent about $' + turnSpent.toFixed(2) + ' of its $' + turnLimit.toFixed(2) + ' budget. Continue this step?',
              options: [{ label: 'Allow step' }, { label: 'Increase turn limit' }, { label: 'Cancel' }],
            }])
          } catch (error) {
            return { kind: 'reject' }
          }
          const selected = answer !== null && answer !== undefined && Array.isArray(answer.answers) && Array.isArray(answer.answers[0]?.selected)
            ? answer.answers[0].selected[0]
            : undefined
          if (selected === 'Allow step') {
            turnApprovedSteps.set(sessionId, approvalKey)
          } else if (selected === 'Increase turn limit') {
            const choices = increaseChoices(turnLimit)
            let amountAnswer
            try {
              amountAnswer = await ask([{
                id: 'turn-cost-cap-amount',
                header: 'Turn cost cap',
                question: 'Choose a new per-turn budget.',
                detail: 'Current budget ' + usd(turnLimit) + '; this turn has spent ' + usd(turnSpent) + '.',
                options: choices.map((value) => ({
                  label: usd(value),
                  description: '+' + usd(value - turnLimit),
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
              await setTurnLimit(sessionId, Number(match[1]))
            } catch (error) {
              return { kind: 'reject' }
            }
          } else {
            return { kind: 'reject' }
          }
        }
      }
    }

    if (limit !== null && limitApprovedTurns.get(sessionId) !== payload.turn && total >= limit) {
      if (questions === undefined || typeof questions.ask !== 'function') return { kind: 'reject' }
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
      } else if (selected === 'Increase limit') {
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
      } else {
        return { kind: 'reject' }
      }
    }
    return next()
  }), 'balance: cost cap')

  ctx.effect(() => ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const sessionId = agent.session.id
    const state = turnStarts.get(sessionId)
    if (state !== undefined && state.turn === turn) turnStarts.delete(sessionId)
    turnApprovedSteps.delete(sessionId)
    limitApprovedTurns.delete(sessionId)
  }), 'balance: turn budget cleanup')

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
      path: LIMIT_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await request.json()
          const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
          if (sessionId === '') return Response.json({ ok: false, error: { code: 'limit-command-failed', message: 'sessionId is required', details: {} } })
          const scope = payload.scope === 'turn' ? 'turn' : 'session'
          const input = typeof payload.input === 'string' ? payload.input : ''
          const result = await runLimitCommand(scope, { id: sessionId }, input)
          if (result.kind === 'error') {
            return Response.json({ ok: false, error: { code: 'limit-command-failed', message: result.text, details: {} } })
          }
          return Response.json({ ok: true, value: { ...result, sessionId, scope } })
        } catch (error) {
          return Response.json({ ok: false, error: { code: 'limit-command-failed', message: describeError(error), details: {} } })
        }
      },
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'balance: limit route')

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

function parseLimitInput(text) {
  const trimmed = String(text).trim()
  const relative = /^([+-])\s*\$?\s*([0-9]+(?:\.[0-9]+)?)$/.exec(trimmed)
  if (relative !== null) {
    return { relative: true, sign: relative[1] === '-' ? -1 : 1, amount: Number(relative[2]) }
  }
  const absolute = /^\$?\s*([0-9]+(?:\.[0-9]+)?)$/.exec(trimmed)
  if (absolute !== null) return { relative: false, sign: 1, amount: Number(absolute[1]) }
  return undefined
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
