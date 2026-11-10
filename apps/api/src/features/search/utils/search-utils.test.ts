// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, buildFtsQuery, mapSearchResultRow, authorDisplayName } from './search-utils'
import type { Seed, SearchResultRow } from '@beechcms/core'

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

const PRIVATE_TEXT_SEED = {
  slug: 'internal_notes',
  displayNameAlias: 'note',
  branches: [
    { id: 'br_01', alias: 'note', type: 'text', policies: { public: false, search: true } },
  ],
} as unknown as Seed

const SOFT_DELETE_SEED = {
  slug: 'articoli_soft',
  displayNameAlias: 'title',
  softDelete: true,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', policies: { search: true } },
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

  it('entryId containing colons roundtrips correctly without truncation', () => {
    const entryId = 'urn:article:123:section:456'
    const cursor = encodeCursor(-1.5, entryId)
    const decoded = decodeCursor(cursor)
    expect(decoded?.rank).toBeCloseTo(-1.5)
    expect(decoded?.entryId).toBe(entryId)
  })

  it('returns null for invalid base64', () => {
    expect(decodeCursor('!!!not-base64!!!')).toBeNull()
  })

  it('returns null when decoded string has no colon separator', () => {
    expect(decodeCursor(btoa('noseparator'))).toBeNull()
  })

  it('returns null when the rank segment is not a number', () => {
    expect(decodeCursor(btoa('notanumber:entry-1'))).toBeNull()
  })
})

// ─── buildFtsQuery ───────────────────────────────────────────────────────────

describe('buildFtsQuery', () => {
  it('returns empty-result query when no seed has a searchable FTS branch', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null },
      [NO_FTS_SEED],
    )
    expect(result.sql).toContain('WHERE 1=0')
    expect(result.binds).toHaveLength(0)
    expect(result.countSql).toContain('SELECT 0 as total')
  })

  it('excludes seeds with private text branches from FTS queries', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null },
      [PRIVATE_TEXT_SEED],
    )
    expect(result.sql).toContain('WHERE 1=0')
    expect(result.sql).not.toContain('fts_internal_notes')
  })

  it('throws EMPTY_QUERY when all terms are stripped or too short (single chars)', () => {
    expect(() =>
      buildFtsQuery({ queryText: 'a b', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null }, [TEXT_SEED]),
    ).toThrow('EMPTY_QUERY')
  })

  it('generates a query referencing the seed FTS and content tables', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.sql).toContain('fts_articoli')
    expect(result.sql).toContain('content_articoli')
    expect(result.sql).toContain('snippet(fts_articoli, -1,')
    expect(result.sql).toContain('LIMIT ?')
    expect(result.binds.at(-1)).toBe(21) // pageSize + 1 for has-more detection
  })

  it('UNION ALLs multiple seeds when no schemaSlug filter is set', () => {
    const result = buildFtsQuery(
      { queryText: 'test', schemaSlug: null, statusFilter: null, pageSize: 10, cursor: null },
      [TEXT_SEED, SECOND_SEED],
    )
    expect(result.sql).toContain('UNION ALL')
    expect(result.sql).toContain('fts_articoli')
    expect(result.sql).toContain('fts_team')
  })

  it('limits query to the requested schemaSlug when provided', () => {
    const result = buildFtsQuery(
      { queryText: 'test', schemaSlug: 'articoli', statusFilter: null, pageSize: 20, cursor: null },
      [TEXT_SEED, SECOND_SEED],
    )
    expect(result.sql).toContain('fts_articoli')
    expect(result.sql).not.toContain('fts_team')
  })

  it('adds statusFilter to WHERE clause and bind values', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: 'published', pageSize: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.sql).toContain('ce.status = ?')
    expect(result.binds).toContain('published')
  })

  it('adds cursor-based pagination condition when cursor is valid', () => {
    const cursor = encodeCursor(-1.5, 'entry-123')
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 20, cursor },
      [TEXT_SEED],
    )
    expect(result.sql).toContain('bm25')
    expect(result.binds).toContain('entry-123')
  })

  it('ignores an invalid cursor and produces no pagination condition', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: 'bad-cursor' },
      [TEXT_SEED],
    )
    expect(result.binds).not.toContain('entry-123')
  })

  it('countSql wraps each seed count in a SUM', () => {
    const result = buildFtsQuery(
      { queryText: 'test', schemaSlug: null, statusFilter: null, pageSize: 10, cursor: null },
      [TEXT_SEED, SECOND_SEED],
    )
    expect(result.countSql).toContain('SUM')
    expect(result.countSql).toContain('fts_articoli')
    expect(result.countSql).toContain('fts_team')
  })

  it('count binds do not include the pageSize+1 sentinel', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 5, cursor: null },
      [TEXT_SEED],
    )
    expect(result.countBinds).not.toContain(6) // pageSize + 1 must not appear in count binds
  })

  it('single-character terms (length < 2) are filtered out', () => {
    // 'a b c' — single-char terms discarded; result depends on remaining terms
    expect(() =>
      buildFtsQuery({ queryText: 'a b c', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null }, [TEXT_SEED]),
    ).toThrow('EMPTY_QUERY')
  })

  it('numeric terms are quoted without prefix expansion', () => {
    const result = buildFtsQuery(
      { queryText: '2024', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.binds[0]).toBe('"2024"')
  })

  it('generates a single prefix token for alphabetic terms without backwards prefix expansion', () => {
    const result = buildFtsQuery(
      { queryText: 'superman', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.binds[0]).toBe('"superman"*')
  })

  it('appends ce.deleted_at IS NULL to data query and count query for soft-delete seeds (#465)', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null },
      [SOFT_DELETE_SEED],
    )
    expect(result.sql).toContain('ce.deleted_at IS NULL')
    expect(result.countSql).toContain('ce.deleted_at IS NULL')
  })

  it('appends ce.deleted_at IS NULL to data query and count query for a seed that declares no flag', () => {
    const result = buildFtsQuery(
      { queryText: 'hello', schemaSlug: null, statusFilter: null, pageSize: 20, cursor: null },
      [TEXT_SEED],
    )
    expect(result.sql).toContain('ce.deleted_at IS NULL')
    expect(result.countSql).toContain('ce.deleted_at IS NULL')
  })
})

const ENTRY_ID = '3f2b8c1e-5a7d-4e9b-8c6a-1d2e3f4a5b6c'

function searchRow(overrides: Partial<SearchResultRow> = {}): SearchResultRow {
  return {
    entryId: ENTRY_ID,
    schemaSlug: 'articoli',
    slug: 'my-post',
    status: 'published',
    updatedAt: 1_700_000_000,
    title: 'My Post',
    excerpt: 'A snippet',
    rank: -1,
    ...overrides,
  }
}

describe('mapSearchResultRow', () => {
  it('maps a camelCase repository row to the wire-format SearchResultItem', () => {
    const row = searchRow({ excerpt: '<p>A <mark>word</mark> here</p>' })

    const result = mapSearchResultRow(row, null)

    expect(result).toEqual({
      id: ENTRY_ID, schema_slug: 'articoli', slug: 'my-post',
      status: 'published', updated_at: 1_700_000_000, author_name: null,
      title: 'My Post', excerpt: 'A <mark>word</mark> here', data: {},
    })
  })

  it('defaults title and excerpt to empty strings when null', () => {
    const row = searchRow({ title: null, excerpt: null as unknown as string })

    const result = mapSearchResultRow(row, null)

    expect(result.title).toBe('')
    expect(result.excerpt).toBe('')
  })

  it('copies updatedAt into updated_at and the given name into author_name', () => {
    const row = searchRow({ updatedAt: 1_712_345_678 })

    const result = mapSearchResultRow(row, 'Jane Doe')

    expect(result.updated_at).toBe(1_712_345_678)
    expect(result.author_name).toBe('Jane Doe')
  })

  it('yields author_name null when no name is given', () => {
    const row = searchRow()

    const result = mapSearchResultRow(row, null)

    expect(result.author_name).toBeNull()
  })

  it('strips HTML tags from the excerpt but keeps bare <mark> and </mark>', () => {
    const row = searchRow({ excerpt: '<p>A <mark>word</mark> here</p>' })

    const result = mapSearchResultRow(row, null)

    expect(result.excerpt).toBe('A <mark>word</mark> here')
  })

  it('strips attributes from <mark> tags instead of passing them through verbatim (#610)', () => {
    const row = searchRow({ excerpt: '<mark onmouseover=alert(1)>word</mark> here' })

    const result = mapSearchResultRow(row, null)

    // Regression guard: a raw <mark onmouseover=…> must not reach an innerHTML consumer.
    expect(result.excerpt).toBe('<mark>word</mark> here')
  })

  it('strips attributes from a </mark> closing tag as well (#610)', () => {
    const row = searchRow({ excerpt: '<mark>word</mark onclick=alert(1)> here' })

    const result = mapSearchResultRow(row, null)

    // Regression guard: the closing tag is normalised too, not only the opening one.
    expect(result.excerpt).toBe('<mark>word</mark> here')
  })

  it('collapses whitespace runs in the excerpt', () => {
    const row = searchRow({ excerpt: '<p>  lots   of  space  </p>' })

    const result = mapSearchResultRow(row, null)

    expect(result.excerpt).toBe('lots of space')
  })
})

describe('authorDisplayName', () => {
  const NAME_PRESENCE_CASES: { label: string; userName: string | null; expected: string }[] = [
    { label: 'a non-blank name is returned trimmed', userName: '  Jane Doe  ', expected: 'Jane Doe' },
    { label: 'an empty name falls back to the e-mail', userName: '', expected: 'jane@example.com' },
    { label: 'a whitespace-only name falls back to the e-mail', userName: '   ', expected: 'jane@example.com' },
    { label: 'a null name falls back to the e-mail', userName: null, expected: 'jane@example.com' },
  ]

  it('returns the trimmed name when present and the e-mail otherwise', () => {
    for (const { userName, expected } of NAME_PRESENCE_CASES) {
      const label = authorDisplayName({ entryId: ENTRY_ID, userName, userEmail: 'jane@example.com' })

      expect(label).toBe(expected)
    }
  })
})
