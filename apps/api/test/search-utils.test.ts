import { describe, expect, it } from 'vitest'
import { getSeed } from '@beech/core'
import {
  encodeCursor,
  decodeCursor,
  buildFtsQuery,
  mapFtsRow,
} from '../src/search-utils'

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
    it('generates valid SQL for a single-term query', () => {
      const { sql, binds, countSql, countBinds } = buildFtsQuery({
        q: 'hello',
        schemaSlug: null,
        status: null,
        limit: 10,
        cursor: null,
      })
      expect(sql).toContain('FROM content_fts')
      expect(sql).toContain('content_fts MATCH ?')
      expect(sql).toContain('LIMIT ?')
      expect(sql).toContain('ORDER BY bm25(content_fts)')
      expect(binds).toHaveLength(2) // ftsMatch + limit+1
      expect(binds[1]).toBe(11)
      expect(countSql).toContain('COUNT(*) AS total')
      expect(countBinds).toHaveLength(1)
    })

    it('generates multi-prefix fuzzy match for long terms', () => {
      const { binds } = buildFtsQuery({
        q: 'hello',
        schemaSlug: null,
        status: null,
        limit: 10,
        cursor: null,
      })
      const ftsMatch = binds[0] as string
      // 'hello' (len=5, MIN_PREFIX=3) → prefixes hel, hell, hello
      expect(ftsMatch).toContain('"hel"*')
      expect(ftsMatch).toContain('"hell"*')
      expect(ftsMatch).toContain('"hello"*')
    })

    it('uses prefix-only match for short terms (≤ MIN_PREFIX)', () => {
      const { binds } = buildFtsQuery({
        q: 'ab',
        schemaSlug: null,
        status: null,
        limit: 10,
        cursor: null,
      })
      const ftsMatch = binds[0] as string
      expect(ftsMatch).toBe('"ab"*')
    })

    it('treats numeric-only terms as exact match', () => {
      const { binds } = buildFtsQuery({
        q: '2024',
        schemaSlug: null,
        status: null,
        limit: 10,
        cursor: null,
      })
      const ftsMatch = binds[0] as string
      expect(ftsMatch).toBe('"2024"')
    })

    it('handles multi-term queries (AND-combined in FTS)', () => {
      const { binds } = buildFtsQuery({
        q: 'hello world',
        schemaSlug: null,
        status: null,
        limit: 5,
        cursor: null,
      })
      const ftsMatch = binds[0] as string
      expect(ftsMatch).toContain('"hel"*')
      expect(ftsMatch).toContain('"wor"*')
    })

    it('adds schema_slug filter to main and count queries', () => {
      const { sql, binds, countSql, countBinds } = buildFtsQuery({
        q: 'test',
        schemaSlug: 'articoli',
        status: null,
        limit: 5,
        cursor: null,
      })
      expect(sql).toContain('schema_slug = ?')
      expect(binds[1]).toBe('articoli')
      expect(countSql).toContain('schema_slug = ?')
      expect(countBinds[1]).toBe('articoli')
    })

    it('adds status filter to main and count queries', () => {
      const { sql, binds, countSql, countBinds } = buildFtsQuery({
        q: 'test',
        schemaSlug: null,
        status: 'published',
        limit: 5,
        cursor: null,
      })
      expect(sql).toContain('status = ?')
      expect(binds).toContain('published')
      expect(countSql).toContain('status = ?')
      expect(countBinds).toContain('published')
    })

    it('combines schema_slug and status filters', () => {
      const { binds } = buildFtsQuery({
        q: 'test',
        schemaSlug: 'news',
        status: 'draft',
        limit: 5,
        cursor: null,
      })
      // ftsMatch, schemaSlug, status, limit+1
      expect(binds).toHaveLength(4)
      expect(binds[1]).toBe('news')
      expect(binds[2]).toBe('draft')
    })

    it('adds keyset pagination clause for a valid cursor', () => {
      const cursor = encodeCursor(-2.5, 'entry-xyz')
      const { sql, binds } = buildFtsQuery({
        q: 'test',
        schemaSlug: null,
        status: null,
        limit: 10,
        cursor,
      })
      expect(sql).toContain('bm25(content_fts) > ?')
      expect(binds).toContain(-2.5)
      expect(binds).toContain('entry-xyz')
    })

    it('ignores a malformed cursor (falls through without keyset clause)', () => {
      const { sql } = buildFtsQuery({
        q: 'test',
        schemaSlug: null,
        status: null,
        limit: 10,
        cursor: 'invalid-cursor',
      })
      expect(sql).not.toContain('bm25(content_fts) > ?')
    })

    it('strips special FTS chars and throws EMPTY_QUERY when nothing remains', () => {
      expect(() =>
        buildFtsQuery({ q: '"^(*)', schemaSlug: null, status: null, limit: 10, cursor: null })
      ).toThrow('EMPTY_QUERY')
    })

    it('throws EMPTY_QUERY when all tokens are shorter than 2 chars', () => {
      expect(() =>
        buildFtsQuery({ q: 'a', schemaSlug: null, status: null, limit: 10, cursor: null })
      ).toThrow('EMPTY_QUERY')
    })

    it('fetch limit is limit+1 to detect hasMore', () => {
      const { binds } = buildFtsQuery({
        q: 'test',
        schemaSlug: null,
        status: null,
        limit: 20,
        cursor: null,
      })
      expect(binds[binds.length - 1]).toBe(21)
    })
  })

  describe('mapFtsRow', () => {
    const seedGetter = (slug: string) => getSeed(slug)

    it('maps an fts row to a SearchResultItem with alias-translated data', () => {
      const ftsRow = {
        entry_id: 'e1',
        schema_slug: 'articoli',
        title: 'My Title',
        body: 'body text',
        tags: '',
        status: 'published',
        excerpt: 'My <mark>Title</mark>',
        rank: -1.5,
      }
      const fullRow = { id: 'e1', slug: 'my-title', data: '{"br_01":"My Title"}' }
      const result = mapFtsRow(ftsRow, fullRow, seedGetter)
      expect(result.id).toBe('e1')
      expect(result.title).toBe('My Title')
      expect(result.excerpt).toBe('My <mark>Title</mark>')
      expect(result.schema_slug).toBe('articoli')
      expect(result.slug).toBe('my-title')
      expect(result.status).toBe('published')
    })

    it('returns raw data (no translation) for an unknown schema slug', () => {
      const ftsRow = {
        entry_id: 'e2',
        schema_slug: 'nonexistent_slug',
        title: 'Title',
        body: '',
        tags: '',
        status: 'draft',
        excerpt: '',
        rank: 0,
      }
      const fullRow = { id: 'e2', slug: null, data: '{"br_01":"raw"}' }
      const result = mapFtsRow(ftsRow, fullRow, seedGetter)
      expect(result.data).toEqual({ br_01: 'raw' })
    })

    it('returns empty data object when data JSON is corrupt', () => {
      const ftsRow = {
        entry_id: 'e3',
        schema_slug: 'articoli',
        title: '',
        body: '',
        tags: '',
        status: 'draft',
        excerpt: '',
        rank: 0,
      }
      const fullRow = { id: 'e3', slug: null, data: 'not-json' }
      const result = mapFtsRow(ftsRow, fullRow, seedGetter)
      expect(result.data).toEqual({})
    })

    it('falls back to empty strings for missing title/excerpt', () => {
      const ftsRow = {
        entry_id: 'e4',
        schema_slug: 'articoli',
        title: null as unknown as string,
        body: '',
        tags: '',
        status: 'published',
        excerpt: null as unknown as string,
        rank: 0,
      }
      const fullRow = { id: 'e4', slug: null, data: '{}' }
      const result = mapFtsRow(ftsRow, fullRow, seedGetter)
      expect(result.title).toBe('')
      expect(result.excerpt).toBe('')
    })
  })
})
