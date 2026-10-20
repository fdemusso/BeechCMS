// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

export interface SearchQueryOptions {
  queryText: string
  schemaSlug: string | null
  statusFilter: string | null
  limit: number
  cursor: string | null
}

export interface SearchResultRow {
  entryId: string
  schemaSlug: string
  slug: string | null
  status: string
  title: string | null
  excerpt: string
  rank: number
}

export interface SearchCountResult {
  total: number
}

/**
 * Read-only contract for the global FTS5 search route.
 *
 * Implementations encapsulate the UNION ALL query that fans out across all
 * `fts_<seed>` virtual tables. The route handler stays free of D1 and only
 * shapes the final response.
 */
export interface ISearchRepository {
  /**
   * Executes a UNION ALL full-text search across all FTS-enabled seed tables.
   * Returns at most options.limit + 1 rows so the caller can detect hasMore
   * without a separate count query for the cursor case.
   * A query with no usable terms (EMPTY_QUERY from buildFtsQuery) must resolve
   * to an empty array rather than throw, so the route handler never returns a
   * 500 for it.
   */
  search(options: SearchQueryOptions, seeds: Seed[]): Promise<SearchResultRow[]>

  /**
   * Runs the count variant of the FTS query to support the `total` field in
   * the search response. Called in parallel with search() by the route handler
   * with the same filter inputs but without limit/cursor. An EMPTY_QUERY
   * resolves to `{ total: 0 }` rather than throwing.
   */
  count(
    options: Omit<SearchQueryOptions, 'limit' | 'cursor'>,
    seeds: Seed[],
  ): Promise<SearchCountResult>
}
