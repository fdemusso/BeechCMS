// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import {
  isKanbanAxisRequired,
  kanbanColumnEntryValue,
  resolveKanbanConfig,
  validateAndSanitizeSeedPayload,
  type KanbanMoveBody,
} from '@beechcms/core'
import { publicProblem } from '../../../public/errors/problem-details'
import { handleContentDatabaseError } from './helpers'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'

function isAxisMove(axis: unknown): axis is NonNullable<KanbanMoveBody['axis']> {
  if (typeof axis !== 'object' || axis === null || !('value' in axis)) return false
  return typeof axis.value === 'string' || axis.value === null
}

export async function kanbanMoveHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  if (!slug || !id) {
    return publicProblem(context, { type: 'content-invalid-slug-or-id', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })
  }

  let body: KanbanMoveBody
  try {
    const raw = await context.req.json<KanbanMoveBody>()
    if (typeof raw.position !== 'string' || !raw.position || typeof raw.axisBranchId !== 'string' || !raw.axisBranchId) {
      throw new Error('invalid')
    }
    body = raw
  } catch {
    return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: 'position and axisBranchId are required strings' })
  }
  if (body.axis !== undefined && !isAxisMove(body.axis)) {
    return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: 'axis.value must be a string or null' })
  }

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

  return context.json({ success: true })
}
