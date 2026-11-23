// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { EntryNotFoundError, SlugConflictError, HookValidationError, EntryConflictError, type ActivityAction, type Seed } from '@beechcms/core'
import { publicProblem, fkProblemOrNull } from '../../../public/errors/problem-details'
import { D1BackrefRepository } from '../../../shared/db/repositories/d1-backref.repository'
import { CONTENT_ERRORS } from '../constants'
import { resolveIfMatch } from '../../../shared/utils/occ'
import { AppEnv } from '../../../types'

export { resolveIfMatch }

export function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

export function contentValidationProblem(
  context: Context,
  details: Array<{ field: string; expected: string; received: string; message: string }>
) {
  return publicProblem(context, { 
    type: 'content-validation-failed', 
    title: 'Bad Request', 
    status: 400, 
    detail: 'Validation failed', 
    errors: details 
  })
}

export function logContentActivity(
  context: Context<AppEnv>,
  action: ActivityAction,
  id: string,
  slug: string,
  title: string,
  extraDetails?: Record<string, unknown>
) {
  const jwtPayload = context.get('jwtPayload')
  context.get('activityLogger').log({
    action,
    entityType: 'content',
    entityId: id,
    entitySlug: slug,
    details: { title, ...extraDetails },
    actor: {
      id: jwtPayload.sub,
      email: jwtPayload.email ?? 'unknown',
      name: [jwtPayload.name, jwtPayload.surname].filter(Boolean).join(' ') || null,
    },
  })
}

export function dispatchContentAutomation(
  context: Context<AppEnv>,
  seedSlug: string,
  event: 'create' | 'update' | 'delete',
  entry: Record<string, unknown>
) {
  context.get('scheduler').waitUntil(
    context.get('automationRunner').run({
      seedSlug,
      event,
      entry,
    }),
  )
}

/**
 * A soft delete is an `UPDATE deleted_at`, so the SQLite foreign key never fires and `RESTRICT` would
 * guard only the purge. This applies the same rule up front: 409 while an active entry still points
 * at `id` through a `RESTRICT` relation, `null` when the entry is free to go to the Trash.
 */
export async function restrictedByBackrefsProblem(context: Context<AppEnv>, seed: Seed, id: string) {
  const sources = (context.get('backrefMap').get(seed.slug) ?? []).filter(source => source.restricts)
  if (sources.length === 0) return null

  const backrefRepository = context.get('backrefRepository') ?? new D1BackrefRepository(context.env.DB)
  const getSeed = context.get('getSeed')

  const blocking: { field: string; total: number }[] = []
  for (const source of sources) {
    const sourceSeed = getSeed(source.sourceSlug)
    if (!sourceSeed) continue
    const { total } = await backrefRepository.queryGroup(source, sourceSeed, id, 1, 0)
    if (total > 0) blocking.push({ field: `${source.sourceSlug}.${source.branchAlias}`, total })
  }
  if (blocking.length === 0) return null

  return publicProblem(context, {
    type: 'https://beechcms.dev/problems/relation-in-use',
    title: 'Relation In Use',
    status: 409,
    detail: 'The record cannot be deleted because it is referenced by one or more related entries.',
    errors: blocking.map(({ field, total }) => ({
      field,
      expected: '0 referencing entries',
      received: `${total} referencing entries`,
      message: `${total} active entries in '${field}' still reference this record.`,
    })),
  })
}

export function handleContentDatabaseError(context: Context<AppEnv>, error: unknown) {
  if (error instanceof EntryNotFoundError) {
    return publicProblem(context, { 
      type: 'content-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.NOT_FOUND 
    })
  }
  if (error instanceof SlugConflictError) {
    return publicProblem(context, {
      type: 'content-slug-conflict',
      title: 'Conflict',
      status: 409,
      detail: CONTENT_ERRORS.SLUG_CONFLICT,
    })
  }
  if (error instanceof EntryConflictError) {
    return publicProblem(context, {
      type: 'content-update-conflict',
      title: 'Conflict',
      status: 409,
      detail: CONTENT_ERRORS.UPDATE_CONFLICT,
    })
  }

  if (error instanceof HookValidationError) {
    return publicProblem(context, {
      type: 'content-hook-validation-failed',
      title: 'Unprocessable Entity',
      status: 422,
      detail: error.message,
      errors: (error.fields ?? []).map(f => ({ field: f.field, expected: '', received: '', message: f.message })),
    })
  }


  const fkResponse = fkProblemOrNull(context, error, context.req.method)
  if (fkResponse) return fkResponse

  console.error('Content database error:', error)
  return publicProblem(context, {
    type: 'content-database-error',
    title: 'Internal Server Error',
    status: 500,
    detail: CONTENT_ERRORS.DATABASE_ERROR,
  })
}
