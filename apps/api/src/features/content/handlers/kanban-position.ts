// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import { resolveKanbanConfig, EntryNotFoundError } from '@beechcms/core'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'

export async function kanbanPositionHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  if (!slug || !id) {
    return publicProblem(context, { type: 'content-invalid-slug-or-id', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })
  }

  let body: { position?: unknown; axisBranchId?: unknown }
  try {
    body = await context.req.json()
  } catch {
    return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }

  const { position, axisBranchId } = body
  if (typeof position !== 'string' || !position || typeof axisBranchId !== 'string' || !axisBranchId) {
    return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: 'position and axisBranchId are required strings' })
  }

  const compat = resolveKanbanConfig(seed)
  if (!compat.compatible || !compat.candidates.some(c => c.branchId === axisBranchId)) {
    return publicProblem(context, { type: 'content-invalid-kanban-axis', title: 'Bad Request', status: 400, detail: 'axisBranchId is not a valid kanban candidate for this seed' })
  }

  try {
    await context.get('repository').findById(seed, id)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })
    }
    throw error
  }

  await context.get('kanbanPositionRepository').setPosition(slug, id, axisBranchId, position)

  return context.json({ success: true })
}
