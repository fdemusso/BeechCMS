// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/types
 * Feature-scoped TypeScript types for the search vertical slice.
 * Kept separate from `search-utils.ts` so utilities stay importable without
 * dragging in HTTP-layer concerns, and to align with the VSA type file convention.
 */

import type { SearchResultRow } from '@beechcms/core'

// ─── FTS raw row ─────────────────────────────────────────────────────────────

/**
 * Raw database row returned by the UNION ALL FTS query.
 * Field names use snake_case to match SQLite column aliases verbatim.
 */
export interface FtsRow {
  /** Unique identifier of the matching content entry. */
  entry_id:    string
  /** Slug of the seed (content type) the entry belongs to. */
  schema_slug: string
  /** URL-friendly slug of the entry, if set. */
  slug:        string | null
  /** Publication status of the entry (e.g. `published`, `draft`). */
  status:      string
  /** Display title of the entry, sourced from the seed's `displayNameAlias` column. */
  title:       string | null
  /** HTML snippet produced by SQLite's `snippet()` function highlighting matched terms. */
  excerpt:     string
  /** BM25 relevance score; lower (more negative) means more relevant. */
  rank:        number
}

// ─── Wire-format response types ──────────────────────────────────────────────

/**
 * A single search result item returned to the API consumer.
 * HTML tags are stripped from the excerpt except for `<mark>` highlighting wrappers.
 */
export interface SearchResultItem {
  /** Unique identifier of the matching content entry. */
  id:          string
  /** Slug of the seed (content type) the entry belongs to. */
  schema_slug: string
  /** URL-friendly slug of the entry, if set. */
  slug:        string | null
  /** Publication status of the entry. */
  status:      string
  /** Display title of the entry; empty string when the entry has no title. */
  title:       string
  /** Plain-text excerpt with `<mark>…</mark>` wrappers around matched terms. */
  excerpt:     string
  /**
   * Additional entry fields.
   * Currently always `{}` — reserved for future field projection support.
   */
  data:        Record<string, unknown>
}

/**
 * Paginated response envelope returned by `GET /api/search`.
 */
export interface SearchResponse {
  /** Matched entries for the current page. */
  items:      SearchResultItem[]
  /**
   * Opaque cursor for the next page, or `null` when there are no more results.
   * Pass as the `cursor` query parameter on the next request.
   */
  nextCursor: string | null
  /** Total number of matching entries across all pages. */
  total:      number
}

// ─── FTS query parameter types ───────────────────────────────────────────────

/**
 * Normalised, validated query parameters consumed by {@link buildFtsQuery}.
 * The handler clamps `pageSize` before passing it here; this type assumes
 * all values are already within their valid ranges.
 */
export interface FtsQueryParams {
  /** Full-text search term entered by the user; must be ≥ 2 characters. */
  queryText:    string
  /**
   * When set, restricts the search to entries belonging to this seed slug.
   * `null` searches across all searchable seeds.
   */
  schemaSlug:   string | null
  /**
   * When set, adds a `status = ?` filter to each per-seed sub-query.
   * `null` returns entries in any status.
   */
  statusFilter: string | null
  /** Maximum entries to return, already clamped to `[1, 50]` by the handler. */
  pageSize:     number
  /**
   * Opaque pagination cursor produced by {@link encodeCursor}.
   * `null` starts from the first page.
   */
  cursor:       string | null
}

// ─── Embed response type ─────────────────────────────────────────────────────

/**
 * Response body returned by `GET /api/v1/public/search/embed`.
 */
export interface EmbedResponse {
  /** Flat array of 32-bit floats representing the embedding vector. */
  data:  number[]
  /** Tuple describing the shape of the vector, e.g. `[384]`. */
  shape: [number]
}

// ─── Re-export core type for internal use ────────────────────────────────────

export type { SearchResultRow }
