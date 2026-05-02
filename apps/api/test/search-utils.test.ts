import { describe, expect, it } from 'vitest'
import { SEED_REGISTRY, getSeed } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import {
  encodeCursor,
  decodeCursor,
  buildFtsQuery,
  mapFtsRow,
  type FtsRow,
} from '../src/search-utils'

const allSeeds = Object.values(SEED_REGISTRY) as Seed[]
const articoliOnly = [getSeed('articoli')!]

describe('search-utils', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('round-trips rank and entryId', () => {
      const encoded = encodeCursor(-1.234, 'entry-abc')
      const decoded = decodeCursor(encoded)
      expect(decoded).not.toBeNull()
      expect(decoded!.rank).toBeCloseTo(-1.234)
      expect(decoded!.entryId).toBe('entry-abc')
    })

    it('handles alphanumeric entryId without colons', () => {
      const encoded = encodeCursor(0, 'ent_01abc123xyz')
      const decoded = decodeCursor(encoded)
      expect(decoded).not.toBeNull()
      expect(decoded!.rank).toBe(0)
      expect(decoded!.entryId).toBe('ent_01abc123xyz')
    })

    it('returns null for invalid base64', () => {
      expect(decodeCursor('!!!not-valid-base64!!!')).toBeNull()
    })

    it('returns null when decoded string has no colon separator', () => {
      const noColon = btoa('nocolon')
      expect(decodeCursor(noColon)).toBeNull()
    })

    it('handles negative rank correctly', () => {
      const encoded = encodeCursor(-9.99, 'z')
      const decoded = decodeCursor(encoded)
      expect(decoded!.rank).toBeCloseTo(-9.99)
      expect(decoded!.entryId).toBe('z')
    })
  })

  describe('buildFtsQuery', () => {
    it('generates UNION ALL query across seeds with richtext branches', () => {
      const { sql, binds } = buildFtsQuery(
        { q: 'hello', schemaSlug: null, status: null, limit: 10, cursor: null },
        allSeeds
      )
      // Should query per-seed FTS tables (v0.4.0 — no global content_fts)
      expect(sql).toContain('fts_')
      expect(sql).toContain('MATCH ?')
      expect(sql).toContain('LIMIT ?')
      expect(sql).toContain('ORDER BY rank')
      // Last bind is limit+1
      expect(binds[binds.length - 1]).toBe(11)
    })

    it('generates multi-prefix fuzzy match for long terms', () => {
      const { binds } = buildFtsQuery(
        { q: 'hello', schemaSlug: null, status: null, limit: 10, cursor: null },
        articoliOnly
      )
      const ftsMatch = binds[0] as string
      expect(ftsMatch).toContain('"hel"*')
      expect(ftsMatch).toContain('"hell"*')
      expect(ftsMatch).toContain('"hello"*')
    })

    it('uses prefix-only match for short terms (≤ MIN_PREFIX)', () => {
      const { binds } = buildFtsQuery(
        { q: 'ab', schemaSlug: null, status: null, limit: 10, cursor: null },
        articoliOnly
      )
      const ftsMatch = binds[0] as string
      expect(ftsMatch).toBe('"ab"*')
    })

    it('treats numeric-only terms as exact match', () => {
      const { binds } = buildFtsQuery(
        { q: '2024', schemaSlug: null, status: null, limit: 10, cursor: null },
        articoliOnly
      )
      const ftsMatch = binds[0] as string
      expect(ftsMatch).toBe('"2024"')
    })

    it('handles multi-term queries (AND-combined in FTS)', () => {
      const { binds } = buildFtsQuery(
        { q: 'hello world', schemaSlug: null, status: null, limit: 5, cursor: null },
        articoliOnly
      )
      const ftsMatch = binds[0] as string
      expect(ftsMatch).toContain('"hel"*')
      expect(ftsMatch).toContain('"wor"*')
    })

    it('filters to a single seed when schemaSlug is specified', () => {
      const { sql, binds } = buildFtsQuery(
        { q: 'test', schemaSlug: 'articoli', status: null, limit: 5, cursor: null },
        allSeeds
      )
      // Only fts_articoli should appear, not fts_prodotti etc.
      expect(sql).toContain('fts_articoli')
      expect(sql).not.toContain('fts_prodotti')
      // No sql-level schema_slug filter — filtering is done by seed selection
      expect(sql).not.toContain('schema_slug = ?')
      expect(binds[0]).toContain('"tes"*')
    })

    it('adds status filter to WHERE clause', () => {
      const { sql, binds, countSql, countBinds } = buildFtsQuery(
        { q: 'test', schemaSlug: null, status: 'published', limit: 5, cursor: null },
        articoliOnly
      )
      expect(sql).toContain('ce.status = ?')
      expect(binds).toContain('published')
      expect(countSql).toContain('ce.status = ?')
      expect(countBinds).toContain('published')
    })

    it('adds keyset pagination clause for a valid cursor', () => {
      const cursor = encodeCursor(-2.5, 'entry-xyz')
      const { sql, binds } = buildFtsQuery(
        { q: 'test', schemaSlug: null, status: null, limit: 10, cursor },
        articoliOnly
      )
      expect(sql).toContain('bm25(fts_articoli) > ?')
      expect(binds).toContain(-2.5)
      expect(binds).toContain('entry-xyz')
    })

    it('ignores a malformed cursor (falls through without keyset clause)', () => {
      const { sql } = buildFtsQuery(
        { q: 'test', schemaSlug: null, status: null, limit: 10, cursor: 'invalid-cursor' },
        articoliOnly
      )
      expect(sql).not.toContain('bm25(fts_articoli) > ?')
    })

    it('strips special FTS chars and throws EMPTY_QUERY when nothing remains', () => {
      expect(() =>
        buildFtsQuery({ q: '"^(*)', schemaSlug: null, status: null, limit: 10, cursor: null }, articoliOnly)
      ).toThrow('EMPTY_QUERY')
    })

    it('throws EMPTY_QUERY when all tokens are shorter than 2 chars', () => {
      expect(() =>
        buildFtsQuery({ q: 'a', schemaSlug: null, status: null, limit: 10, cursor: null }, articoliOnly)
      ).toThrow('EMPTY_QUERY')
    })

    it('fetch limit is limit+1 to detect hasMore', () => {
      const { binds } = buildFtsQuery(
        { q: 'test', schemaSlug: null, status: null, limit: 20, cursor: null },
        articoliOnly
      )
      expect(binds[binds.length - 1]).toBe(21)
    })

    it('returns empty query when no seeds have searchable FTS', () => {
      // Pass a seed with no richtext branches
      const seedNoFts: Seed = {
        ...getSeed('messaggi')!,
        branches: getSeed('messaggi')!.branches.filter(b => b.type !== 'richtext' && b.type !== 'text'),
      }
      const { sql, binds } = buildFtsQuery(
        { q: 'test', schemaSlug: null, status: null, limit: 10, cursor: null },
        [seedNoFts]
      )
      // Empty result — no FTS tables to query
      expect(sql).toContain('WHERE 1=0')
      expect(binds).toHaveLength(0)
    })

    it('count query sums across all seed FTS tables', () => {
      const { countSql } = buildFtsQuery(
        { q: 'test', schemaSlug: null, status: null, limit: 10, cursor: null },
        allSeeds
      )
      expect(countSql).toContain('SUM(c)')
    })
  })

  describe('mapFtsRow', () => {
    it('maps an fts row to a SearchResultItem', () => {
      const row: FtsRow = {
        entry_id:    'e1',
        schema_slug: 'articoli',
        slug:        'my-title',
        status:      'published',
        title:       'My Title',
        excerpt:     'My <mark>Title</mark>',
        rank:        -1.5,
      }
      const result = mapFtsRow(row)
      expect(result.id).toBe('e1')
      expect(result.schema_slug).toBe('articoli')
      expect(result.slug).toBe('my-title')
      expect(result.status).toBe('published')
      expect(result.title).toBe('My Title')
      expect(result.excerpt).toBe('My <mark>Title</mark>')
      expect(result.data).toEqual({})
    })

    it('falls back to empty strings for missing title/excerpt', () => {
      const row: FtsRow = {
        entry_id:    'e4',
        schema_slug: 'articoli',
        slug:        null,
        status:      'published',
        title:       null,
        excerpt:     '',
        rank:        0,
      }
      const result = mapFtsRow(row)
      expect(result.title).toBe('')
      expect(result.excerpt).toBe('')
    })
  })
})
