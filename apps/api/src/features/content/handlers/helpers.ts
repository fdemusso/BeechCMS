// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { EntryNotFoundError, SlugConflictError } from '@beechcms/core'
import { publicProblem, fkProblemOrNull } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

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
  action: 'create' | 'update' | 'delete',
  id: string,
  slug: string,
  title: string
) {
  const jwtPayload = context.get('jwtPayload')
  context.get('activityLogger').log({
    action,
    entityType: 'content',
    entityId: id,
    entitySlug: slug,
    details: { title },
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
