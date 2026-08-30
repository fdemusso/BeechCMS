// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module shared/db/repositories/d1-search.query
 * Pure SQL query builder utilities for SQLite/D1 FTS5 full-text search.
 */

import type { Seed, SearchResultRow } from '@beechcms/core'
import { indexableSearchBranches } from '@beechcms/core'
import { SEARCH_LIMITS } from '../../../features/search/constants'

/**
 * Raw database row returned by the UNION ALL FTS query.
 * Field names use snake_case to match SQLite column aliases verbatim.
 */
export interface FtsRow {
  entry_id:    string
  schema_slug: string
  slug:        string | null
  status:      string
  title:       string | null
  excerpt:     string
  rank:        number
}

/**
 * Validated query parameters passed to {@link buildFtsQuery}.
 */
export interface FtsQueryParams {
  queryText:    string
  schemaSlug:   string | null
  statusFilter: string | null
  pageSize:     number
  cursor:       string | null
}

/**
 * Result of {@link buildFtsQuery}: parameterised SQL for both the
 * paginated data fetch and the total-count query.
 */
export interface FtsQueryResult {
  sql:        string
  binds:      unknown[]
  countSql:   string
  countBinds: unknown[]
}

/**
 * Decodes a pagination cursor (`${rank}:${entryId}`).
 */
export function decodeCursor(cursor: string): { rank: number; entryId: string } | null {
  try {
    const decoded = atob(cursor)
    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex === -1) return null
    const rank = Number.parseFloat(decoded.slice(0, separatorIndex))
    if (Number.isNaN(rank)) return null
    return {
      rank,
      entryId: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

/**
 * Returns `true` when the seed has at least one text or richtext branch
 * that is indexable for search (search !== false and public !== false).
 */
function isSeedFullTextSearchable(seed: Seed): boolean {
  return indexableSearchBranches(seed).length > 0
}

/**
 * Builds a SQLite FTS5 MATCH expression from a raw user query string.
 */
function buildFtsMatchExpression(rawQuery: string): string {
  const sanitisedQuery = rawQuery.replace(/["*^()]/g, ' ').trim()
  const terms = sanitisedQuery.split(/\s+/).filter((term) => term.length >= SEARCH_LIMITS.FTS_TERM_MIN_LENGTH)

  if (terms.length === 0) {
    throw new Error('EMPTY_QUERY')
  }

  return terms
    .map((term) => {
      if (/^\d+$/.test(term)) {
        // Numeric terms: quote verbatim to avoid FTS5 operator mis-parsing
        return `"${term}"`
      }

      return `"${term}"*`
    })
    .join(' ')
}

/**
 * Builds a UNION ALL query across all per-seed FTS tables that satisfy
 * {@link isSeedFullTextSearchable}.
 */
export function buildFtsQuery(params: FtsQueryParams, seeds: Seed[]): FtsQueryResult {
  const { queryText, schemaSlug, statusFilter, pageSize, cursor } = params

  const matchExpression = buildFtsMatchExpression(queryText)

  const searchableSeeds = seeds.filter(
    (seed) =>
      isSeedFullTextSearchable(seed) &&
      (schemaSlug === null || seed.slug === schemaSlug),
  )

  if (searchableSeeds.length === 0) {
    return {
      sql:        "SELECT NULL as entry_id, NULL as schema_slug, NULL as slug, NULL as status, NULL as title, '' as excerpt, 0 as rank WHERE 1=0",
      binds:      [],
      countSql:   'SELECT 0 as total',
      countBinds: [],
    }
  }

  const decodedCursor = cursor ? decodeCursor(cursor) : null

  const perSeedQueryParts:  string[]  = []
  const queryBinds:         unknown[] = []
  const perSeedCountParts:  string[]  = []
  const countBinds:         unknown[] = []

  for (const seed of searchableSeeds) {
    const ftsTable     = `fts_${seed.slug}`
    const contentTable = `content_${seed.slug}`
    const titleColumn  = seed.displayNameAlias

    // ── Main query sub-select ─────────────────────────────────────────────
    const whereConditions: string[]  = [`${ftsTable} MATCH ?`]
    const subQueryBinds:   unknown[] = [matchExpression]

    if (statusFilter) {
      whereConditions.push('ce.status = ?')
      subQueryBinds.push(statusFilter)
    }

    if (decodedCursor) {
      // Keyset pagination: advance past the last row of the previous page.
      // bm25() values are negative: a higher score has a more-negative value.
      whereConditions.push(
        `(bm25(${ftsTable}) > ? OR (bm25(${ftsTable}) = ? AND f.entry_id > ?))`,
      )
      subQueryBinds.push(decodedCursor.rank, decodedCursor.rank, decodedCursor.entryId)
    }

    perSeedQueryParts.push(
      `SELECT f.entry_id, '${seed.slug}' AS schema_slug, ce.slug, ce.status,` +
      ` ce.${titleColumn} AS title,` +
      ` snippet(${ftsTable}, -1, '<mark>', '</mark>', '…', 16) AS excerpt,` +
      ` bm25(${ftsTable}) AS rank` +
      ` FROM ${ftsTable} f JOIN ${contentTable} ce ON ce.id = f.entry_id` +
      ` WHERE ${whereConditions.join(' AND ')}`,
    )
    queryBinds.push(...subQueryBinds)

    // ── Count sub-select (no cursor, no LIMIT) ────────────────────────────
    const countConditions: string[]  = [`${ftsTable} MATCH ?`]
    const subCountBinds:   unknown[] = [matchExpression]

    if (statusFilter) {
      countConditions.push('ce.status = ?')
      subCountBinds.push(statusFilter)
    }

    perSeedCountParts.push(
      `SELECT COUNT(*) as c FROM ${ftsTable} f JOIN ${contentTable} ce ON ce.id = f.entry_id` +
      ` WHERE ${countConditions.join(' AND ')}`,
    )
    countBinds.push(...subCountBinds)
  }

  // Fetch one extra row to detect whether a next page exists (has-more sentinel)
  const sql = `${perSeedQueryParts.join(' UNION ALL ')} ORDER BY rank, entry_id LIMIT ?`
  queryBinds.push(pageSize + 1)

  const countSql = `SELECT SUM(c) as total FROM (${perSeedCountParts.join(' UNION ALL ')})`

  return { sql, binds: queryBinds, countSql, countBinds }
}

/**
 * Maps raw FtsRow database representation to core SearchResultRow.
 */
export function mapFtsRowToResultRow(row: FtsRow): SearchResultRow {
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
