// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/search-utils
 * Pure utility functions for the search feature slice.
 *
 * Zero Hono dependencies — fully importable from Vitest without a running worker.
 * FTS is per-seed (`fts_{slug}`), joined with `content_{slug}` for metadata.
 */

import type { Seed } from '@beechcms/core'
import type { FtsRow, FtsQueryParams, SearchResultItem } from '../types'

export type { FtsRow, FtsQueryParams, SearchResultItem }

// ─── Cursor encoding ─────────────────────────────────────────────────────────

/**
 * Encodes a BM25 rank and an entry ID into an opaque, URL-safe pagination cursor.
 *
 * The cursor is base64-encoded so it can be passed safely as a query parameter.
 * Use {@link decodeCursor} to reverse the operation.
 *
 * @param rank    - BM25 relevance score of the last row on the current page.
 * @param entryId - Unique identifier of the last row on the current page.
 * @returns An opaque base64 string suitable for the `cursor` query parameter.
 */
export function encodeCursor(rank: number, entryId: string): string {
  return btoa(`${rank}:${entryId}`)
}

/**
 * Decodes a pagination cursor produced by {@link encodeCursor}.
 *
 * Returns `null` when the input is not valid base64 or does not contain
 * the expected `rank:entryId` separator, so callers can safely ignore
 * malformed cursors without throwing.
 *
 * @param cursor - Opaque cursor string from a previous search response.
 * @returns Parsed `{ rank, entryId }` or `null` if the cursor is invalid.
 */
export function decodeCursor(cursor: string): { rank: number; entryId: string } | null {
  try {
    const decoded = atob(cursor)
    const separatorIndex = decoded.lastIndexOf(':')
    if (separatorIndex === -1) return null
    return {
      rank:    Number.parseFloat(decoded.slice(0, separatorIndex)),
      entryId: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Returns `true` when the seed has at least one `text` or `richtext` branch
 * that is not explicitly excluded from search via `policies.search = false`.
 *
 * Only seeds satisfying this predicate will be included in FTS queries.
 *
 * @param seed - Seed definition to inspect.
 */
function isSeedFullTextSearchable(seed: Seed): boolean {
  return seed.branches.some(
    (branch) =>
      (branch.type === 'text' || branch.type === 'richtext') &&
      branch.policies?.search !== false,
  )
}

/**
 * Builds a SQLite FTS5 MATCH expression from a raw user query string.
 *
 * Each term is expanded into a set of prefix variants (e.g. `"hel"* OR "hell"* OR "hello"*`)
 * to support incremental-search-style queries. Numeric terms are quoted verbatim
 * to prevent SQLite from treating digits as operator tokens.
 *
 * @param rawQuery - Unsanitised user query string.
 * @returns A valid FTS5 MATCH expression string.
 * @throws `Error('EMPTY_QUERY')` when all terms are too short (< 2 characters) after sanitisation.
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

/** Re-import limits for use inside the module without a circular dependency. */
import { SEARCH_LIMITS } from '../constants'

// ─── FTS query builder ───────────────────────────────────────────────────────

/**
 * The full result of {@link buildFtsQuery}: parameterised SQL for both the
 * paginated data fetch and the total-count query.
 */
export interface FtsQueryResult {
  /** Parameterised SQL for fetching a page of results (`ORDER BY rank, entry_id LIMIT ?`). */
  sql:        string
  /** Bind values for `sql`, in positional order. */
  binds:      unknown[]
  /** Parameterised SQL for counting total matching entries (no `LIMIT`). */
  countSql:   string
  /** Bind values for `countSql`, in positional order. */
  countBinds: unknown[]
}

/**
 * Builds a UNION ALL query across all per-seed FTS tables that satisfy
 * {@link isSeedFullTextSearchable}.
 *
 * Each per-seed sub-query joins `fts_{slug}` with `content_{slug}` to
 * retrieve title, slug, and status alongside the BM25 rank and snippet.
 * When `params.schemaSlug` is set, only the matching seed is queried.
 *
 * When no seed qualifies (either none are searchable or the `schemaSlug`
 * filter matches nothing), a degenerate `WHERE 1=0` query is returned so
 * callers always receive a valid SQL string without needing a special-case path.
 *
 * @param params - Validated, clamped query parameters from the route handler.
 * @param seeds  - Full seed registry; filtered internally by searchability and `schemaSlug`.
 * @returns A {@link FtsQueryResult} with parameterised SQL and bind arrays.
 * @throws `Error('EMPTY_QUERY')` when the query string contains no usable terms.
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
      ` snippet(${ftsTable}, 1, '<mark>', '</mark>', '…', 16) AS excerpt,` +
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

// ─── Row mappers ─────────────────────────────────────────────────────────────

/**
 * Strips all HTML tags from a snippet string while preserving `<mark>` and
 * `</mark>` wrappers used for search term highlighting.
 * Collapses runs of whitespace produced by tag removal into a single space.
 *
 * @param htmlSnippet - Raw HTML string from SQLite's `snippet()` function.
 * @returns Plain-text string with `<mark>…</mark>` highlighting intact.
 */
function stripHtmlPreservingMarkTags(htmlSnippet: string): string {
  return htmlSnippet
    .replace(/<(?!\/?mark\b)[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Maps a raw database {@link FtsRow} (snake_case) to the wire-format
 * {@link SearchResultItem} returned to API consumers.
 *
 * HTML tags in the excerpt are stripped via {@link stripHtmlPreservingMarkTags}.
 *
 * @param row - Raw row from the UNION ALL FTS query.
 * @returns A sanitised {@link SearchResultItem} ready for JSON serialisation.
 */
export function mapFtsRow(row: FtsRow): SearchResultItem {
  return {
    id:          row.entry_id,
    schema_slug: row.schema_slug,
    slug:        row.slug,
    status:      row.status,
    title:       row.title ?? '',
    excerpt:     stripHtmlPreservingMarkTags(row.excerpt ?? ''),
    data:        {},
  }
}

/**
 * Maps a repository-shaped {@link SearchResultRow} (camelCase) to the
 * wire-format {@link SearchResultItem} returned by the `GET /api/search` route.
 *
 * This is the counterpart of {@link mapFtsRow} for rows that have already been
 * normalised by the search repository layer.
 *
 * @param row - Repository result row with camelCase field names.
 * @returns A sanitised {@link SearchResultItem} ready for JSON serialisation.
 */
export function mapSearchResultRow(row: import('@beechcms/core').SearchResultRow): SearchResultItem {
  return {
    id:          row.entryId,
    schema_slug: row.schemaSlug,
    slug:        row.slug,
    status:      row.status,
    title:       row.title ?? '',
    excerpt:     stripHtmlPreservingMarkTags(row.excerpt ?? ''),
    data:        {},
  }
}
