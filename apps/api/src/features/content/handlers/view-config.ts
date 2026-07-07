// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import { seedViewConfigSchema, validateCardConfigAgainstSeed } from '@beechcms/core'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'

export async function getViewConfigHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })
  }

  const config = await context.get('seedLayoutRepository').getViewConfig(slug)
  return context.json(config ?? {})
}

export async function putViewConfigHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })
  }

  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }

  const parsed = seedViewConfigSchema.safeParse(body)
  if (!parsed.success) {
    return publicProblem(context, { type: 'content-invalid-view-config', title: 'Unprocessable Entity', status: 422, detail: parsed.error.issues[0]?.message ?? 'Invalid view config' })
  }

  if (parsed.data.card) {
    const { cleaned } = validateCardConfigAgainstSeed(parsed.data.card, seed)
    parsed.data = { ...parsed.data, card: cleaned }
  }

  const jwtPayload = context.get('jwtPayload')
  await context.get('seedLayoutRepository').setViewConfig(slug, parsed.data, jwtPayload.sub)
  return context.json({ ok: true })
}
