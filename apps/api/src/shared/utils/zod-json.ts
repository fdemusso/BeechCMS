// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context, MiddlewareHandler } from 'hono'
import { ZodError, type z } from 'zod'
import type { AppEnv } from '../../types'

/** The `Input` a `zodJson` middleware contributes: what `hc` sends (`in`) and the handler reads (`out`). */
export type ZodJsonInput<S extends z.ZodType> = { in: { json: z.input<S> }; out: { json: z.output<S> } }

/** Why a body was refused: `malformed` is not JSON at all, `invalid` is JSON the schema rejects. */
export type ZodJsonRefusal = 'malformed' | 'invalid'

/**
 * Validates the JSON body against `schema`, which is also where the request type comes from
 * (`hc` infers it from `ZodJsonInput`). On success the parsed value is readable in the handler
 * as `context.req.valid('json')`; on failure `onInvalid` answers.
 *
 * Unlike `hono/validator`, a body that is not JSON is treated as invalid input and goes through
 * `onInvalid` too, so an endpoint keeps one place to shape its errors. `cause` tells the two
 * refusals apart for endpoints that answer them differently; a malformed body is refused even by
 * a schema that would accept `null`.
 */
export function zodJson<S extends z.ZodType>(
  schema: S,
  onInvalid: (context: Context<AppEnv>, error: z.ZodError, cause: ZodJsonRefusal) => Response | Promise<Response>,
): MiddlewareHandler<AppEnv, string, ZodJsonInput<S>> {
  return async (context, next) => {
    let raw: unknown
    try {
      raw = await context.req.json()
    } catch {
      const notJson = new ZodError([{ code: 'custom', path: [], message: 'Request body is not valid JSON', input: undefined }])
      return onInvalid(context as Context<AppEnv>, notJson, 'malformed')
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return onInvalid(context as Context<AppEnv>, parsed.error, 'invalid')
    context.req.addValidatedData('json', parsed.data as object)
    await next()
  }
}
