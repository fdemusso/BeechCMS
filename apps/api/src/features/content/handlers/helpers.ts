// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { EntryNotFoundError, SlugConflictError, HookValidationError, EntryConflictError } from '@beechcms/core'
import { publicProblem, fkProblemOrNull } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

export function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

/**
 * Resolves the OCC guard for PUT /:slug/:id: an `If-Match` header (weak or strong, quoted or
 * bare) takes precedence over a `updated_at` field in the body, since If-Match is the
 * HTTP-native mechanism. Returns undefined when neither is present or the value doesn't parse
 * to a finite number, which callers treat as "no guard requested".
 */
export function resolveIfMatch(context: Context, body: Record<string, unknown>): number | undefined {
  const header = context.req.header('If-Match')
  if (header !== undefined) {
    const unquoted = header.replace(/^W\//, '').replace(/^"|"$/g, '')
    const parsed = Number(unquoted)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  if (body.updated_at !== undefined) {
    const parsed = Number(body.updated_at)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
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
