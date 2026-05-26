// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Context, Hono } from 'hono'
import {
  validateAndSanitizeSeedPayload,
  resolvePolicies,
  RelationTargetNotFoundError,
} from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import { cleanStr } from '../../shared/query-utils'
import { applyVisibility } from '../../shared/apply-policies'
import { AppEnv } from '../../types'
import { CONTENT_ERRORS } from '../content/constants'
import { draftGuard } from './draft.middleware'

const draftApp = new Hono<AppEnv>()


function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

function logDraftActivity(
  context: Context<AppEnv>,
  id: string,
  slug: string,
  title: string,
  note: 'draft saved' | 'draft published'
) {
  const actor = context.get('jwtPayload')
  context.get('activityLogger').log({
    action: 'update',
    entityType: 'content',
    entityId: id,
    entitySlug: slug,
    details: { title, note },
    actor: {
      id: actor.sub,
      email: actor.email ?? 'unknown',
      name: actor.name ?? null,
    },
  })
}

// PUT /:slug/:id/draft — Creates or overwrites the pending draft
draftApp.put('/:slug/:id/draft', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await context.req.json<unknown>())
  } catch {
    return publicProblem(context, { 
      type: 'content-invalid-json', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_JSON_BODY 
    })
  }

  const sensitiveAliases = Object.keys(body).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    return branch != null && resolvePolicies(branch).privacy !== 'plain'
  })
  
  if (sensitiveAliases.length > 0) {
    return publicProblem(context, { 
      type: 'content-sensitive-field-edit', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `${CONTENT_ERRORS.SENSITIVE_FIELD_EDIT}: ${sensitiveAliases.join(', ')}` 
    })
  }

  const validation = validateAndSanitizeSeedPayload(seed, body, {
    operation: 'update',
    allowNull: true,
    requireAtLeastOneValidField: true,
    enforceRequiredFields: false,
    idGenerator: context.get('idGenerator'),
  })
  
  if (validation.dangerousFields.length > 0) {
    return publicProblem(context, { 
      type: 'content-dangerous-content', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `Dangerous markup in field '${validation.dangerousFields[0]}'` 
    })
  }
  
  if (validation.details.length > 0) {
    return publicProblem(context, { 
      type: 'content-validation-failed', 
      title: 'Bad Request', 
      status: 400, 
      detail: 'Validation failed', 
      errors: validation.details 
    })
  }

  const repository = context.get('repository')
  await repository.saveDraft(seed, id, validation.data)

  const displayTitle = cleanStr(validation.data[seed.displayNameAlias]) ?? id
  logDraftActivity(context, id, slug, displayTitle, 'draft saved')

  return context.json({ success: true })
})

// GET /:slug/:id/draft — Retrieves the pending draft
draftApp.get('/:slug/:id/draft', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  const repository = context.get('repository')
  const draft = await repository.getDraft(seed, id)

  if (!draft) {
    return publicProblem(context, { 
      type: 'draft-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: 'No pending draft for this entry' 
    })
  }

  return context.json({ data: applyVisibility(draft, seed) })
})

// POST /:slug/:id/draft/publish — Atomically promotes draft to live
draftApp.post('/:slug/:id/draft/publish', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  const repository = context.get('repository')
  const draft = await repository.getDraft(seed, id)

  if (!draft) {
    return publicProblem(context, { 
      type: 'draft-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: 'No pending draft to publish' 
    })
  }

  try {
    await repository.publishDraft(seed, id)
  } catch (err) {
    if (err instanceof RelationTargetNotFoundError) {
      return publicProblem(context, {
        type: 'relation-target-not-found',
        title: 'Relation Target Not Found',
        status: 422,
        detail: `Field '${err.alias}' references '${err.targetSeed}' id='${err.value}' which does not exist`,
      })
    }
    throw err
  }

  const displayValue = draft[seed.displayNameAlias]
  const displayStr = typeof displayValue === 'string' ? displayValue : id
  logDraftActivity(context, id, slug, displayStr, 'draft published')

  return context.json({ success: true })
})

// DELETE /:slug/:id/draft — Discards the pending draft
draftApp.delete('/:slug/:id/draft', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  const repository = context.get('repository')
  await repository.deleteDraft(seed, id)

  return context.json({ success: true })
})

export { draftApp }
