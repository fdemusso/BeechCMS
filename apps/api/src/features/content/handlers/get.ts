// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { applyVisibility } from '../../../shared/policies/apply-policies'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { EntryNotFoundError, ActorContext } from '@beechcms/core'

export async function getByIdHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  if (!slug || !id) {
    return publicProblem(context, { 
      type: 'content-invalid-slug-or-id', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID 
    })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }

  try {
    const repository = context.get('repository')
    const item = await repository.findById(seed, id)
    
    let hasPendingDraft = false
    if (seed.allowDrafts) {
      hasPendingDraft = await repository.hasDraft(seed, id)
    }

    const jwtPayload = context.get('jwtPayload')
    const actor: ActorContext = context.get('actor') ?? {
      type: 'authenticated',
      userId: jwtPayload?.sub,
      role: jwtPayload?.role,
    }

    return context.json({
      ...item,
      has_pending_draft: hasPendingDraft,
      data: applyVisibility(item, seed, actor)
    })
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { 
        type: 'content-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: CONTENT_ERRORS.NOT_FOUND 
      })
    }
    console.error('Content detail error:', error)
    return publicProblem(context, { 
      type: 'content-database-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: CONTENT_ERRORS.DATABASE_ERROR 
    })
  }
}

export async function getBySlugHandler(context: Context<AppEnv>) {
  const schemaSlug = context.req.param('schema_slug')
  const entrySlug = context.req.param('entry_slug')
  if (!schemaSlug || !entrySlug) {
    return publicProblem(context, { 
      type: 'content-invalid-slug-or-id', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID 
    })
  }

  const seed = context.get('getSeed')(schemaSlug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }

  try {
    const repository = context.get('repository')
    const item = await repository.findBySlug(seed, entrySlug)
    
    let hasPendingDraft = false
    if (seed.allowDrafts) {
      hasPendingDraft = await repository.hasDraft(seed, item.id)
    }

    const jwtPayload = context.get('jwtPayload')
    const actor: ActorContext = context.get('actor') ?? {
      type: 'authenticated',
      userId: jwtPayload?.sub,
      role: jwtPayload?.role,
    }

    return context.json({
      ...item,
      has_pending_draft: hasPendingDraft,
      data: applyVisibility(item, seed, actor)
    })
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { 
        type: 'content-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: CONTENT_ERRORS.NOT_FOUND 
      })
    }
    console.error('Content by-slug error:', error)
    return publicProblem(context, { 
      type: 'content-database-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: CONTENT_ERRORS.DATABASE_ERROR 
    })
  }
}
