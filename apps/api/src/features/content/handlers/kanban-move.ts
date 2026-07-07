// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import {
  resolveKanbanConfig,
  validateAndSanitizeSeedPayload,
  type KanbanMoveBody,
} from '@beechcms/core'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'

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

  const compat = resolveKanbanConfig(seed)
  const candidate = compat.candidates.find(c => c.branchId === body.axisBranchId)
  if (!compat.compatible || !candidate) {
    return publicProblem(context, { type: 'content-invalid-kanban-axis', title: 'Bad Request', status: 400, detail: 'axisBranchId is not a valid kanban candidate for this seed' })
  }

  const axisBranch = seed.branches.find(b => b.id === body.axisBranchId)!

  const repository = context.get('repository')
  let current: Record<string, unknown>
  try {
    current = await repository.findById(seed, id) as Record<string, unknown>
  } catch {
    return publicProblem(context, { type: 'content-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.NOT_FOUND })
  }

  let patch: Record<string, unknown> | null = null

  if (body.axis) {
    if (body.axis.kind === 'scalar') {
      const rawValue = body.axis.value
      const coerced: unknown = axisBranch.type === 'boolean' && rawValue !== null
        ? rawValue === 'true'
        : rawValue
      patch = { [axisBranch.alias]: coerced }
    } else {
      // tags: server-side atomic swap (Q1)
      const currentTags = (current[axisBranch.alias] as string[] | null) ?? []
      const { oldValue, newValue } = body.axis
      const withoutOld = oldValue !== null ? currentTags.filter(t => t !== oldValue) : currentTags
      const nextTags = newValue !== null ? [...withoutOld, newValue] : withoutOld
      patch = { [axisBranch.alias]: nextTags }
    }

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
  await repository.updateWithKanbanPosition(seed, id, patch, body.position, body.axisBranchId, { actor: jwtPayload.sub })

  return context.json({ success: true })
}
