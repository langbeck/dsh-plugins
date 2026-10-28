/**
 * Balance — Host half (Cordis plugin).
 *
 * Owns the row's Config schema, the OpenRouter pricing cache, and the
 * Session-cost fold. The Client reads the account balance itself; the Host
 * exposes the cost estimate over the authenticated Connection exact Fetch
 * route `/api/balance-session-cost` (owner peer only).
 */

import Schema from '@deepseek-ai/schemastery'

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

export function apply(ctx, config) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  const interval = Number.isFinite(settings.pricingRefreshSeconds) && settings.pricingRefreshSeconds >= 60
    ? Math.round(settings.pricingRefreshSeconds)
    : 3600
  const pricing = createPricing(interval)
  const costCache = new Map()
  const catalogCache = new Map()

  ctx.effect(() => {
    pricing.start()
    return () => pricing.dispose()
  }, 'balance: pricing')

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: COST_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const payload = await request.json()
          const value = await readSessionCost(ctx, pricing, catalogCache, costCache, payload, request.signal)
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
