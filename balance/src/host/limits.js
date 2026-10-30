/** Durable per-Session cost limits owned by the Balance plugin. */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

export const LIMITS_DOMAIN = defineDomain({
  name: 'balance',
  version: 1,
  tables: {
    session_limits: domainTable(z.object({
      limitUsd: z.number(),
      updatedAt: z.number(),
    })),
  },
})

/** Durable per-Session turn budgets, separate from the session cap domain. */
export const TURN_LIMITS_DOMAIN = defineDomain({
  name: 'balance_turn_limits',
  version: 1,
  tables: {
    session_turn_limits: domainTable(z.object({
      limitUsd: z.number(),
      updatedAt: z.number(),
    })),
  },
})
