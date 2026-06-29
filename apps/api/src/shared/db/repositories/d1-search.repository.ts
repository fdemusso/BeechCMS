// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  Seed,
  ISearchRepository,
  SearchQueryOptions,
  SearchResultRow,
  SearchCountResult,
} from '@beechcms/core'
import { buildFtsQuery, type FtsRow } from '../../../features/search/search-utils'

const EMPTY_QUERY_ERROR = 'EMPTY_QUERY'

/**
 * D1-backed implementation of {@link ISearchRepository}.
 *
 * Delegates SQL composition to the pure `buildFtsQuery` helper to keep this
 * class focused on D1 wiring. Returns raw rows; the route handler is
 * responsible for mapping them via `mapFtsRow`.
 */
export class D1SearchRepository implements ISearchRepository {
  constructor(private readonly database: D1Database) {}

  async search(options: SearchQueryOptions, seeds: Seed[]): Promise<SearchResultRow[]> {
    let queryParts
    try {
      queryParts = buildFtsQuery(
        {
          q: options.queryText,
          schemaSlug: options.schemaSlug,
          status: options.statusFilter,
          limit: options.limit,
          cursor: options.cursor,
        },
        seeds,
      )
    } catch (error) {
      if (error instanceof Error && error.message === EMPTY_QUERY_ERROR) return []
      throw error
    }

    const result = await this.database.prepare(queryParts.sql).bind(...queryParts.binds).all<FtsRow>()
    return (result.results ?? []).map(mapFtsRowToResultRow)
  }

  async count(
    options: Omit<SearchQueryOptions, 'limit' | 'cursor'>,
    seeds: Seed[],
  ): Promise<SearchCountResult> {
    let queryParts
    try {
      queryParts = buildFtsQuery(
        {
          q: options.queryText,
          schemaSlug: options.schemaSlug,
          status: options.statusFilter,
          limit: 0,
          cursor: null,
        },
        seeds,
      )
    } catch (error) {
      if (error instanceof Error && error.message === EMPTY_QUERY_ERROR) return { total: 0 }
      throw error
    }

    const row = await this.database
      .prepare(queryParts.countSql)
      .bind(...queryParts.countBinds)
      .first<{ total: number }>()
    return { total: row?.total ?? 0 }
  }
}

function mapFtsRowToResultRow(row: FtsRow): SearchResultRow {
  return {
    entryId: row.entry_id,
    schemaSlug: row.schema_slug,
    slug: row.slug,
    status: row.status,
    title: row.title,
    excerpt: row.excerpt,
    rank: row.rank,
  }
}
