// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/handlers/full-text-search
 * Thin route handler for `GET /api/search`.
 *
 * Responsibilities:
 * - Parse and validate query parameters.
 * - Delegate the data fetch and count to the injected `searchRepository`.
 * - Assemble and return the paginated {@link SearchResponse}.
 *
 * The handler intentionally contains no SQL — all data access is performed
 * through the `searchRepository` injected by `repositoryMiddleware`.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../../../types'
import { SEARCH_ERRORS, SEARCH_LIMITS } from '../constants'
import type { SearchResponse } from '../types'
import { encodeCursor, mapSearchResultRow } from '../utils/search-utils'

/**
 * Handles `GET /api/search?q=…&schema_slug=…&status=…&limit=20&cursor=…`.
 *
 * Query parameters:
 * - `q`           – Full-text search term (required, ≥ 2 characters).
 * - `schema_slug` – Restrict results to a single seed slug (optional).
 * - `status`      – Restrict results by publication status (optional).
 * - `limit`       – Number of results per page, clamped to `[1, 50]` (default: 20).
 * - `cursor`      – Opaque pagination cursor from a previous response (optional).
 *
 * @param c - Hono context with typed `AppEnv` bindings and variables.
 * @returns A JSON {@link SearchResponse} with items, nextCursor, and total.
 */
export async function fullTextSearchHandler(c: Context<AppEnv>): Promise<Response> {
  const queryText    = c.req.query('q')?.trim() ?? ''
  const schemaSlug   = c.req.query('schema_slug') ?? null
  const statusFilter = c.req.query('status') ?? null
  const rawLimit     = Number.parseInt(c.req.query('limit') ?? String(SEARCH_LIMITS.DEFAULT_PAGE_SIZE), 10)
  const limit        = Math.min(Math.max(rawLimit, SEARCH_LIMITS.MIN_PAGE_SIZE), SEARCH_LIMITS.MAX_PAGE_SIZE)
  const cursor       = c.req.query('cursor') ?? null

  if (queryText.length < SEARCH_LIMITS.QUERY_MIN_LENGTH) {
    return c.json({ error: SEARCH_ERRORS.QUERY_TOO_SHORT }, 400)
  }

  const allSeeds        = c.get('seedRegistry').all()
  const searchRepository = c.get('searchRepository')

  const searchOptions = { queryText, schemaSlug, statusFilter, limit, cursor }
  const countOptions  = { queryText, schemaSlug, statusFilter }

  const [rawRows, countResult] = await Promise.all([
    searchRepository.search(searchOptions, allSeeds),
    searchRepository.count(countOptions, allSeeds),
  ])

  const hasNextPage  = rawRows.length > limit
  const pageRows     = hasNextPage ? rawRows.slice(0, limit) : rawRows

  const lastRow   = pageRows.at(-1)
  const nextCursor = hasNextPage && lastRow
    ? encodeCursor(lastRow.rank, lastRow.entryId)
    : null

  if (pageRows.length === 0) {
    return c.json({ items: [], nextCursor: null, total: countResult.total } satisfies SearchResponse)
  }

  const items = pageRows.map(mapSearchResultRow)

  return c.json({ items, nextCursor, total: countResult.total } satisfies SearchResponse)
}
