// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import { EntryNotFoundError } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import { CONTENT_ERRORS } from '../content/constants'
import type { AppEnv } from '../../types'

/**
 * Middleware that guards draft-related endpoints.
 * Responsibilities:
 * 1. Validates that the targeted Seed schema exists.
 * 2. Ensures the Seed configuration explicitly allows drafts.
 * 3. Confirms that the main live content entry exists in the repository.
 */
export const draftGuard = createMiddleware<AppEnv>(async (context, next) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')

  if (!slug || !id) {
    return publicProblem(context, {
      type: 'content-invalid-request',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing required route parameters',
    })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'content-seed-not-found',
      title: 'Not Found',
      status: 404,
      detail: CONTENT_ERRORS.SEED_NOT_FOUND,
    })
  }

  if (!seed.allowDrafts) {
    return publicProblem(context, {
      type: 'draft-not-allowed',
      title: 'Method Not Allowed',
      status: 405,
      detail: 'This content type does not support pending drafts. Set allowDrafts: true on the Seed to enable.',
    })
  }

  const repository = context.get('repository')
  try {
    await repository.findById(seed, id)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, {
        type: 'content-not-found',
        title: 'Not Found',
        status: 404,
        detail: CONTENT_ERRORS.NOT_FOUND,
      })
    }
    throw error
  }

  await next()
})
