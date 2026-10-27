// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import type { z } from 'zod'
import {
  isKanbanAxisRequired,
  kanbanColumnEntryValue,
  resolveKanbanConfig,
  validateAndSanitizeSeedPayload,
} from '@beechcms/core'
import { publicProblem } from '../../../public/errors/problem-details'
import { handleContentDatabaseError } from './helpers'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'
import type { ZodJsonInput, ZodJsonRefusal } from '../../../shared/utils/zod-json'
import type { kanbanMoveBodySchema } from '../crud.schema'

/**
 * A refused move body: either the required strings are wrong (or the body is not JSON at all) or
 * `axis` is. Both are `content-invalid-body`; the first issue of `kanbanMoveBodySchema` tells them
 * apart, so a body wrong in both ways still reads as the strings, as it always did.
 */
export function rejectInvalidKanbanMove(context: Context, error: z.ZodError, cause: ZodJsonRefusal) {
  if (cause === 'invalid' && error.issues[0].path[0] === 'axis') {
    return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: 'axis.value must be a string or null' })
  }
  return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: 'position and axisBranchId are required strings' })
}

export async function kanbanMoveHandler(context: Context<AppEnv, '/:slug/:id/kanban-move', ZodJsonInput<typeof kanbanMoveBodySchema>>) {
  const slug = context.req.param('slug')
  const id = context.req.param('id')

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })
  }

  const body = context.req.valid('json')

  const compat = resolveKanbanConfig(seed)
  const candidate = compat.candidates.find(c => c.branchId === body.axisBranchId)
  if (!compat.compatible || !candidate) {
    return publicProblem(context, { type: 'content-invalid-kanban-axis', title: 'Bad Request', status: 400, detail: 'axisBranchId is not a valid kanban candidate for this seed' })
  }

  const axisBranch = seed.branches.find(b => b.id === body.axisBranchId)!
  // The board offers no drop on a required axis's null column; this guards direct API calls,
  // since the update validator does not enforce required fields on a partial patch.
  if (body.axis?.value === null && isKanbanAxisRequired(axisBranch)) {
    return publicProblem(context, { type: 'content-validation-error', title: 'Unprocessable Entity', status: 422, detail: `'${axisBranch.alias}' is required and cannot be emptied` })
  }

  const repository = context.get('repository')
  let current: Record<string, unknown>
  try {
    current = await repository.findById(seed, id) as Record<string, unknown>
  } catch {
    return publicProblem(context, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })
  }

  let patch: Record<string, unknown> | null = null

  if (body.axis) {
    patch = { [axisBranch.alias]: kanbanColumnEntryValue(axisBranch, body.axis.value) }

    const validation = validateAndSanitizeSeedPayload(seed, patch, {
      operation: 'update',
      allowNull: true,
      requireAtLeastOneValidField: true,
      enforceRequiredFields: false,
      idGenerator: context.get('idGenerator'),
    })
    if (validation.details.length > 0) {
      return publicProblem(context, { type: 'content-validation-error', title: 'Unprocessable Entity', status: 422, detail: validation.details[0].message })
    }
    patch = validation.data
  }

  const jwtPayload = context.get('jwtPayload')
  try {
    await repository.updateWithKanbanPosition(seed, id, patch, body.position, body.axisBranchId, {
      actor: jwtPayload.sub,
      ifMatch: current.updated_at as number,
    })
  } catch (error) {
    return handleContentDatabaseError(context, error)
  }

  return context.json({ success: true }, 200)
}
