// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { MiddlewareHandler } from 'hono'
import { publicProblem } from '../../public/errors/problem-details'
import type { AppEnv } from '../../types'
import { CONTENT_ERRORS } from './constants'

/**
 * Refuses an unknown `:slug` before anything else reads the request, so the body of a write to a
 * seed that does not exist is never inspected. A middleware rather than a handler step because it
 * has to stay ahead of `zodJson` in the chain: the order of the refusals is part of the contract.
 */
export const requireSeed: MiddlewareHandler<AppEnv> = async (context, next) => {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG })
  }
  if (!context.get('getSeed')(slug)) {
    return publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })
  }
  await next()
}
