// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from '../../types'

/** The `Input` a `zodQuery` middleware contributes: what `hc` sends (`in`) and the handler reads (`out`). */
export type ZodQueryInput<S extends z.ZodType> = { in: { query: z.input<S> }; out: { query: z.output<S> } }

function rejectInvalidQuery(context: Context<AppEnv>): Response {
  return context.json({ error: 'Invalid query string' }, 400)
}

/**
 * Validates the query string against `schema`, which is also where the client's `query` type comes
 * from. The handler reads the parsed value with `context.req.valid('query')`.
 *
 * A repeated key resolves to its first value, as `context.req.query(key)` does, so the schema only
 * ever sees plain strings. Keys the schema does not name are dropped.
 */
export function zodQuery<S extends z.ZodType>(
  schema: S,
  onInvalid: (context: Context<AppEnv>, error: z.ZodError) => Response | Promise<Response> = rejectInvalidQuery,
): MiddlewareHandler<AppEnv, string, ZodQueryInput<S>> {
  return async (context, next) => {
    const firstValues: Record<string, string> = {}
    for (const [key, values] of Object.entries(context.req.queries())) {
      if (values.length > 0) firstValues[key] = values[0]
    }
    const parsed = schema.safeParse(firstValues)
    if (!parsed.success) return onInvalid(context as Context<AppEnv>, parsed.error)
    context.req.addValidatedData('query', parsed.data as object)
    await next()
  }
}
