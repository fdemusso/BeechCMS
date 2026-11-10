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

import type { ContentLastWriter, SearchResultRow } from '@beechcms/core'
import type { FtsQueryParams, SearchResultItem } from '../types'

export type { FtsQueryParams, SearchResultItem }

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

export {
  buildFtsQuery,
  type FtsQueryResult,
  type FtsQueryParams as RepositoryFtsQueryParams,
} from '../../../shared/db/repositories/d1-search.query'

// ─── Row mappers ─────────────────────────────────────────────────────────────

/**
 * Strips all HTML tags from a snippet string while preserving `<mark>` and
 * `</mark>` wrappers used for search term highlighting.
 * Collapses runs of whitespace produced by tag removal into a single space.
 *
 * `<mark>`/`</mark>` are normalised to their bare form first (any attributes
 * discarded), so a literal `<mark onmouseover=…>` present in raw stored text
 * cannot ride through as executable markup for a consumer that trusts the
 * excerpt enough to use `innerHTML`.
 *
 * @param htmlSnippet - Raw HTML string from SQLite's `snippet()` function.
 * @returns Plain-text string with bare `<mark>…</mark>` highlighting intact.
 */
function stripHtmlPreservingMarkTags(htmlSnippet: string): string {
  const MARK_OPEN_TOKEN  = '\u0000mark-open\u0000'
  const MARK_CLOSE_TOKEN = '\u0000mark-close\u0000'
  return htmlSnippet
    .replace(/<mark\b[^>]*>/gi, MARK_OPEN_TOKEN)
    .replace(/<\/mark\b[^>]*>/gi, MARK_CLOSE_TOKEN)
    .replace(/<[^>]*>/g, ' ')
    .split(MARK_OPEN_TOKEN).join('<mark>')
    .split(MARK_CLOSE_TOKEN).join('</mark>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Picks the label shown as a result's author: the trimmed user name, or the
 * e-mail when the account has no usable name.
 *
 * @param writer - Last authoring actor of a content entry.
 * @returns The user name when non-blank, otherwise the user e-mail.
 */
export function authorDisplayName(writer: ContentLastWriter): string {
  const trimmedName = writer.userName?.trim()
  return trimmedName ? trimmedName : writer.userEmail
}

/**
 * Maps a repository-shaped {@link SearchResultRow} (camelCase) to the
 * wire-format {@link SearchResultItem} returned by the `GET /api/search` route.
 *
 * @param row        - Repository result row with camelCase field names.
 * @param authorName - Display name of the entry's last writer, `null` when unknown.
 * @returns A sanitised {@link SearchResultItem} ready for JSON serialisation.
 */
export function mapSearchResultRow(row: SearchResultRow, authorName: string | null): SearchResultItem {
  return {
    id:          row.entryId,
    schema_slug: row.schemaSlug,
    slug:        row.slug,
    status:      row.status,
    updated_at:  row.updatedAt,
    author_name: authorName,
    title:       row.title ?? '',
    excerpt:     stripHtmlPreservingMarkTags(row.excerpt ?? ''),
    data:        {},
  }
}
