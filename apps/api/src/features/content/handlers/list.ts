// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { parsePositiveInt, parseQueryFilters, cleanStr, toEngineFilters } from '../../../shared/query-utils'
import { applyVisibility } from '../../../shared/apply-policies'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

export async function listHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, { 
      type: 'content-invalid-slug', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_SLUG 
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
    const query = context.req.query()
    const search = cleanStr(query.search) ?? ''
    const sortBy = cleanStr(query.sortBy) ?? ''
    const sortDirRaw = cleanStr(query.sortDir)?.toLowerCase() ?? 'asc'
    const rawFilters = parseQueryFilters(query.filters)
    const engineFilters = toEngineFilters(rawFilters)
    
    // Note: repository doesn't yet support has_pending_draft filter/column natively 
    // in findMany without SQL manipulation. We'll stick to basic findMany for now
    // and might need to enhance the repository if this feature is critical for v1 of this refactor.
    // The legacy code was doing a lot of SQL injection here.
    
    const page = parsePositiveInt(query.page, 1)
    const limit = Math.min(parsePositiveInt(query.limit, 25), 100)
    const offset = (page - 1) * limit

    const orderBy = sortBy
      ? { column: sortBy, dir: (sortDirRaw === 'desc' ? 'DESC' : 'ASC') as 'ASC' | 'DESC' }
      : undefined

    const repository = context.get('repository')
    const { items, total } = await repository.findMany(seed, {
      filters: engineFilters,
      orderBy,
      search: search || undefined,
      pagination: { limit, offset },
    })

    const entries = await Promise.all(items.map(async (item) => {
      // Check for pending draft if allowed
      let hasPendingDraft = false
      if (seed.allowDrafts) {
        hasPendingDraft = await repository.hasDraft(seed, item.id)
      }

      return {
        ...item,
        has_pending_draft: hasPendingDraft,
        data: applyVisibility(item, seed) // Repository returns "pure" data including system fields
      }
    }))

    // If no query params (except slug), return array directly (legacy compatibility)
    const hasQueryParams = Boolean(search) || Boolean(sortBy) || Boolean(query.filters) || query.page !== undefined || query.limit !== undefined
    if (!hasQueryParams) {
      return context.json(entries)
    }

    return context.json({ items: entries, total, page, limit })
  } catch (error) {
    console.error('Content list error:', error)
    return publicProblem(context, { 
      type: 'content-database-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: CONTENT_ERRORS.DATABASE_ERROR 
    })
  }
}
