// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest'
import type { Seed, Branch } from './types.js'
import { buildSelectQuery } from './query.js'

const mockSeed: Seed = {
  slug: 'articles',
  label: 'Articles',
  allowDrafts: true,
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', type: 'text', label: 'Title', requiredOnCreate: true },
    { id: 'br_content', alias: 'content', type: 'richtext', label: 'Content' },
    { id: 'br_published', alias: 'published', type: 'boolean', label: 'Published' },
    { id: 'br_price', alias: 'price', type: 'number', label: 'Price' },
    { id: 'br_tags', alias: 'tags', type: 'tags', label: 'Tags' },
    { id: 'br_cover', alias: 'cover', type: 'file', label: 'Cover' },
  ]
}

describe('Query', () => {
  describe('Query Builder', () => {
    it('builds a basic SELECT query', () => {
      const query = buildSelectQuery(mockSeed)
      expect(query.sql).toContain('SELECT content_articles.* FROM content_articles')
      expect(query.sql).toContain('ORDER BY content_articles.created_at DESC')
    })

    it('builds a query with filters', () => {
      const query = buildSelectQuery(mockSeed, {
        filters: [
          { 
            column: 'title', 
            type: 'text', 
            conditions: [{ op: 'contains', value: 'Hello' }] 
          },
          { 
            column: 'price', 
            type: 'number', 
            conditions: [{ op: 'gt', value: 10 }] 
          }
        ]
      })
      expect(query.sql).toContain('title LIKE ?')
      expect(query.sql).toContain('price > ?')
      expect(query.bindings).toContain('%Hello%')
      expect(query.bindings).toContain(10)
    })

    it('handles search with FTS JOIN', () => {
      const query = buildSelectQuery(mockSeed, { search: 'test' })
      expect(query.sql).toContain('INNER JOIN fts_articles ON fts_articles.entry_id = content_articles.id')
      expect(query.sql).toContain('fts_articles MATCH ?')
      expect(query.bindings).toContain('"test"*')
    })

    it('handles pagination', () => {
      const query = buildSelectQuery(mockSeed, { 
        pagination: { limit: 10, offset: 20 } 
      })
      expect(query.sql).toContain('LIMIT ? OFFSET ?')
      expect(query.bindings).toContain(10)
      expect(query.bindings).toContain(20)
    })

    it('handles isCount', () => {
      const query = buildSelectQuery(mockSeed, {
        filters: [
          { 
            column: 'title', 
            type: 'text', 
            conditions: [{ op: 'contains', value: 'Hello' }] 
          }
        ],
        pagination: { limit: 10, offset: 20 },
        isCount: true
      })
      expect(query.sql).toContain('SELECT COUNT(*) as total FROM content_articles')
      expect(query.sql).toContain('title LIKE ?')
      expect(query.sql).not.toContain('ORDER BY')
      expect(query.sql).not.toContain('LIMIT ? OFFSET ?')
      expect(query.bindings).toContain('%Hello%')
      expect(query.bindings).not.toContain(10)
      expect(query.bindings).not.toContain(20)
    })

    it('handles status filter', () => {
      const query = buildSelectQuery(mockSeed, { status: 'published' })
      expect(query.sql).toContain('content_articles.status = ?')
      expect(query.bindings).toContain('published')
    })

    it('handles fields projection', () => {
      const query = buildSelectQuery(mockSeed, { fields: ['id', 'title'] })
      expect(query.sql).toContain('SELECT content_articles.id, title FROM content_articles')
    })

    it('ignores invalid fields in projection', () => {
      const query = buildSelectQuery(mockSeed, { fields: ['title', 'invalid_field'] })
      expect(query.sql).toContain('SELECT title FROM content_articles')
    })

    it('handles custom orderBy', () => {
      const query = buildSelectQuery(mockSeed, { orderBy: { column: 'title', dir: 'ASC' } })
      expect(query.sql).toContain('ORDER BY title ASC')
    })

    it('ignores invalid column in orderBy and fallbacks to created_at DESC', () => {
      const query = buildSelectQuery(mockSeed, { orderBy: { column: 'invalid', dir: 'ASC' } })
      expect(query.sql).toContain('ORDER BY content_articles.created_at DESC')
    })

    it('handles is_empty and is_not_empty conditions', () => {
      const query = buildSelectQuery(mockSeed, {
        filters: [
          { column: 'title', type: 'text', conditions: [{ op: 'is_empty', value: null }] },
          { column: 'price', type: 'number', conditions: [{ op: 'is_not_empty', value: null }] }
        ]
      })
      expect(query.sql).toContain("(title IS NULL OR title = '')")
      expect(query.sql).toContain("price IS NOT NULL")
    })

    it('handles is_empty and is_not_empty conditions for tags/json', () => {
      const query = buildSelectQuery(mockSeed, {
        filters: [
          { column: 'tags', type: 'tags', conditions: [{ op: 'is_empty', value: null }] },
          { column: 'tags', type: 'json', conditions: [{ op: 'is_not_empty', value: null }] }
        ]
      })
      expect(query.sql).toContain("(tags IS NULL OR tags = '[]' OR tags = '{}')")
      expect(query.sql).toContain("(tags IS NOT NULL AND tags != '[]' AND tags != '{}')")
    })

    it('handles in and not_in conditions', () => {
      const query = buildSelectQuery(mockSeed, {
        filters: [
          { column: 'title', type: 'text', conditions: [{ op: 'in', value: ['A', 'B'] }] },
          { column: 'price', type: 'number', conditions: [{ op: 'not_in', value: [10, 20] }] }
        ]
      })
      expect(query.sql).toContain("title IN (?, ?)")
      expect(query.sql).toContain("price NOT IN (?, ?)")
      expect(query.bindings).toEqual(['A', 'B', 10, 20])
    })

    it('handles tags conditions', () => {
      const query = buildSelectQuery(mockSeed, {
        filters: [
          { column: 'tags', type: 'tags', conditions: [{ op: 'has_tag', value: 'tech' }] },
          { column: 'tags', type: 'tags', conditions: [{ op: 'has_all_tags', value: ['a', 'b'] }] }
        ]
      })
      expect(query.sql).toContain("EXISTS (SELECT 1 FROM json_each(tags) WHERE CASE json_type(tags) WHEN 'array' THEN value ELSE key END IN (?))")
      expect(query.sql).toContain("(EXISTS (SELECT 1 FROM json_each(tags) WHERE CASE json_type(tags) WHEN 'array' THEN value ELSE key END = ?) AND EXISTS (SELECT 1 FROM json_each(tags) WHERE CASE json_type(tags) WHEN 'array' THEN value ELSE key END = ?))")
      expect(query.bindings).toEqual(['tech', 'a', 'b'])
    })

    it('handles eq and neq conditions', () => {
      const query = buildSelectQuery(mockSeed, {
        filters: [
          { column: 'title', type: 'text', conditions: [{ op: 'eq', value: 'test' }] },
          { column: 'price', type: 'number', conditions: [{ op: 'neq', value: 10 }] }
        ]
      })
      expect(query.sql).toContain("title = ?")
      expect(query.sql).toContain("price != ?")
      expect(query.bindings).toEqual(['test', 10])
    })

    it('emits LEFT JOIN kanban_positions with parameterized bindings and nulls-last ORDER BY', () => {
      const query = buildSelectQuery(mockSeed, {
        kanbanOrder: { seedSlug: 'articles', axisBranchId: 'br_01' },
      })
      expect(query.sql).toContain('LEFT JOIN kanban_positions kp')
      expect(query.sql).toContain('kp.seed_slug = ?')
      expect(query.sql).toContain('kp.axis_branch_id = ?')
      expect(query.sql).toContain('ORDER BY (kp.position IS NULL) ASC, kp.position ASC')
      expect(query.sql).toContain('kp.position')
      // kp.position must appear in the SELECT projection so the dashboard can read it
      expect(query.sql).toMatch(/SELECT\s+.*kp\.position.*FROM/s)
      expect(query.bindings).toContain('articles')
      expect(query.bindings).toContain('br_01')
    })

    it('kanbanOrder wins over orderBy', () => {
      const query = buildSelectQuery(mockSeed, {
        kanbanOrder: { seedSlug: 'articles', axisBranchId: 'br_01' },
        orderBy: { column: 'title', dir: 'ASC' },
      })
      expect(query.sql).toContain('ORDER BY (kp.position IS NULL) ASC, kp.position ASC')
      expect(query.sql).not.toContain('ORDER BY title')
    })

    it('existing callers without kanbanOrder produce byte-identical SQL (no kp join)', () => {
      const withoutKanban = buildSelectQuery(mockSeed)
      const withoutKanban2 = buildSelectQuery(mockSeed, {})
      expect(withoutKanban.sql).toBe(withoutKanban2.sql)
      expect(withoutKanban.sql).not.toContain('kanban_positions')
    })
  })
})