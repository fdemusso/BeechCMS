// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, buildFtsQuery, mapFtsRow } from './search-utils'
import type { Seed } from '@beechcms/core'

const TEXT_SEED = {
  slug: 'articoli',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', policies: { search: true } },
  ],
} as unknown as Seed

const SECOND_SEED = {
  slug: 'team',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', type: 'text', policies: { search: true } },
  ],
} as unknown as Seed

const NO_FTS_SEED = {
  slug: 'prodotti',
  displayNameAlias: 'nome',
  branches: [
    { id: 'br_01', alias: 'price', type: 'number' },
  ],
} as unknown as Seed

// ─── encodeCursor / decodeCursor ─────────────────────────────────────────────

describe('encodeCursor / decodeCursor', () => {
  it('roundtrip preserves rank and entryId', () => {
    const cursor = encodeCursor(-1.23456, 'entry-abc')
    const decoded = decodeCursor(cursor)
    expect(decoded?.rank).toBeCloseTo(-1.23456)
    expect(decoded?.entryId).toBe('entry-abc')
  })

  it('entryId without colons roundtrips correctly (UUID-style IDs)', () => {
    const entryId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    const cursor = encodeCursor(-3.7, entryId)
    const decoded = decodeCursor(cursor)
    expect(decoded?.rank).toBeCloseTo(-3.7)
    expect(decoded?.entryId).toBe(entryId)
  })

  it('returns null for invalid base64', () => {
    expect(decodeCursor('!!!not-base64!!!')).toBeNull()
  })

  it('returns null when decoded string has no colon separator', () => {
    expect(decodeCursor(btoa('noseparator'))).toBeNull()
  })
})

// ─── buildFtsQuery ───────────────────────────────────────────────────────────

describe('buildFtsQuery', () => {
  it('returns empty-result query when no seed has a searchable FTS branch', () => {
    const result = buildFtsQuery(
      { q: 'hello', schemaSlug: null, status: null, limit: 20, cursor: null },
      [NO_FTS_SEED],
    )
    expect(result.sql).toContain('WHERE 1=0')
    expect(result.binds).toHaveLength(0)
    expect(result.countSql).toContain('SELECT 0 as total')
  })

  it('throws EMPTY_QUERY when all terms are stripped or too short (single chars)', () => {
    expect(() =>
      buildFtsQuery({ q: 'a b', schemaSlug: null, status: null, limit: 20, cursor: null }, [TEXT_SEED]),
    ).toThrow('EMPTY_QUERY')
  })

  it('generates a query referencing the seed FTS and content tables', () => {
    const result = buildFtsQuery(
      { q: 'hello', schemaSlug: null, status: null, limit: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.sql).toContain('fts_articoli')
    expect(result.sql).toContain('content_articoli')
    expect(result.sql).toContain('LIMIT ?')
    expect(result.binds.at(-1)).toBe(21) // limit + 1 for has-more detection
  })

  it('UNION ALLs multiple seeds when no schemaSlug filter is set', () => {
    const result = buildFtsQuery(
      { q: 'test', schemaSlug: null, status: null, limit: 10, cursor: null },
      [TEXT_SEED, SECOND_SEED],
    )
    expect(result.sql).toContain('UNION ALL')
    expect(result.sql).toContain('fts_articoli')
    expect(result.sql).toContain('fts_team')
  })

  it('limits query to the requested schemaSlug when provided', () => {
    const result = buildFtsQuery(
      { q: 'test', schemaSlug: 'articoli', status: null, limit: 20, cursor: null },
      [TEXT_SEED, SECOND_SEED],
    )
    expect(result.sql).toContain('fts_articoli')
    expect(result.sql).not.toContain('fts_team')
  })

  it('adds status filter to WHERE clause and bind values', () => {
    const result = buildFtsQuery(
      { q: 'hello', schemaSlug: null, status: 'published', limit: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.sql).toContain('ce.status = ?')
    expect(result.binds).toContain('published')
  })

  it('adds cursor-based pagination condition when cursor is valid', () => {
    const cursor = encodeCursor(-1.5, 'entry-123')
    const result = buildFtsQuery(
      { q: 'hello', schemaSlug: null, status: null, limit: 20, cursor },
      [TEXT_SEED],
    )
    expect(result.sql).toContain('bm25')
    expect(result.binds).toContain('entry-123')
  })

  it('ignores an invalid cursor and produces no pagination condition', () => {
    const result = buildFtsQuery(
      { q: 'hello', schemaSlug: null, status: null, limit: 20, cursor: 'bad-cursor' },
      [TEXT_SEED],
    )
    expect(result.binds).not.toContain('entry-123')
  })

  it('countSql wraps each seed count in a SUM', () => {
    const result = buildFtsQuery(
      { q: 'test', schemaSlug: null, status: null, limit: 10, cursor: null },
      [TEXT_SEED, SECOND_SEED],
    )
    expect(result.countSql).toContain('SUM')
    expect(result.countSql).toContain('fts_articoli')
    expect(result.countSql).toContain('fts_team')
  })

  it('count binds do not include the limit+1 sentinel', () => {
    const result = buildFtsQuery(
      { q: 'hello', schemaSlug: null, status: null, limit: 5, cursor: null },
      [TEXT_SEED],
    )
    expect(result.countBinds).not.toContain(6) // limit + 1 must not appear in count binds
  })

  it('single-character terms (length < 2) are filtered out', () => {
    // 'a b c' — single-char terms discarded; result depends on remaining terms
    expect(() =>
      buildFtsQuery({ q: 'a b c', schemaSlug: null, status: null, limit: 20, cursor: null }, [TEXT_SEED]),
    ).toThrow('EMPTY_QUERY')
  })

  it('numeric terms are quoted without prefix expansion', () => {
    const result = buildFtsQuery(
      { q: '2024', schemaSlug: null, status: null, limit: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.binds[0]).toContain('"2024"')
  })
})

// ─── mapFtsRow ───────────────────────────────────────────────────────────────

describe('mapFtsRow', () => {
  it('maps all FtsRow fields to SearchResultItem', () => {
    const row = {
      entry_id: 'e1', schema_slug: 'articoli', slug: 'my-post',
      status: 'published', title: 'My Post', excerpt: 'A snippet', rank: -1,
    }
    const result = mapFtsRow(row)
    expect(result.id).toBe('e1')
    expect(result.schema_slug).toBe('articoli')
    expect(result.slug).toBe('my-post')
    expect(result.status).toBe('published')
    expect(result.title).toBe('My Post')
    expect(result.excerpt).toBe('A snippet')
    expect(result.data).toEqual({})
  })

  it('strips HTML tags from excerpt but preserves <mark> and </mark>', () => {
    const row = {
      entry_id: 'e1', schema_slug: 'a', slug: null, status: 'draft',
      title: null, excerpt: '<p>A <mark>word</mark> here</p>', rank: 0,
    }
    expect(mapFtsRow(row).excerpt).toBe('A <mark>word</mark> here')
  })

  it('collapses multiple whitespace characters in excerpt', () => {
    const row = {
      entry_id: 'e1', schema_slug: 'a', slug: null, status: 'draft',
      title: null, excerpt: '<p>  lots   of  space  </p>', rank: 0,
    }
    expect(mapFtsRow(row).excerpt).toBe('lots of space')
  })

  it('returns empty string for null title', () => {
    const row = {
      entry_id: 'e1', schema_slug: 'a', slug: null, status: 'draft',
      title: null, excerpt: '', rank: 0,
    }
    expect(mapFtsRow(row).title).toBe('')
  })
})
