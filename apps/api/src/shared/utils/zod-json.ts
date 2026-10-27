// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from '../../types'

/** The `Input` a `zodJson` middleware contributes: what `hc` sends (`in`) and the handler reads (`out`). */
export type ZodJsonInput<S extends z.ZodType> = { in: { json: z.input<S> }; out: { json: z.output<S> } }

/**
 * Validates the JSON body against `schema`, which is also where the request type comes from
 * (`hc` infers it from `ZodJsonInput`). On success the parsed value is readable in the handler
 * as `context.req.valid('json')`; on failure `onInvalid` answers.
 *
 * Unlike `hono/validator`, a body that is not JSON is treated as invalid input and goes through
 * `onInvalid` too, so an endpoint keeps a single error contract for every malformed request.
 */
export function zodJson<S extends z.ZodType>(
  schema: S,
  onInvalid: (context: Context<AppEnv>, error: z.ZodError) => Response | Promise<Response>,
): MiddlewareHandler<AppEnv, string, ZodJsonInput<S>> {
  return async (context, next) => {
    const raw: unknown = await context.req.json().catch(() => null)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return onInvalid(context as Context<AppEnv>, parsed.error)
    context.req.addValidatedData('json', parsed.data as object)
    await next()
  }
}
