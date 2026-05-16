import { describe, it, expect } from 'vitest'
import { 
  generateCreateTable, 
  generateDraftTable, 
  generateIndexes, 
  buildSelectQuery,
  serializeForDb,
  deserializeFromDb
} from './engine.js'
import type { Seed, Branch } from './types.js'

const mockSeed: Seed = {
  slug: 'articles',
  label: 'Articles',
  allowDrafts: true,
  branches: [
    { alias: 'title', type: 'text', label: 'Title', requiredOnCreate: true },
    { alias: 'content', type: 'richtext', label: 'Content' },
    { alias: 'published', type: 'boolean', label: 'Published' },
    { alias: 'price', type: 'number', label: 'Price' },
    { alias: 'tags', type: 'tags', label: 'Tags' },
    { alias: 'cover', type: 'file', label: 'Cover' },
  ]
}

describe('Botanical Engine', () => {
  describe('DDL Generation', () => {
    it('generates a valid CREATE TABLE statement', () => {
      const sql = generateCreateTable(mockSeed)
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS content_articles')
      expect(sql).toContain('title  TEXT NOT NULL')
      expect(sql).toContain('published  INTEGER CHECK (published IN (0, 1))')
      expect(sql).toContain('price  REAL')
    })

    it('generates a valid CREATE TABLE statement for drafts', () => {
      const sql = generateDraftTable(mockSeed)
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS content_articles_drafts')
      expect(sql).toContain('REFERENCES content_articles(id) ON DELETE CASCADE')
    })

    it('returns null for draft table if drafts are not allowed', () => {
      const noDraftSeed = { ...mockSeed, allowDrafts: false }
      expect(generateDraftTable(noDraftSeed)).toBeNull()
    })

    it('generates indexes for filterable branches', () => {
      const indexes = generateIndexes(mockSeed)
      expect(indexes).toContain('CREATE INDEX IF NOT EXISTS idx_articles_status ON content_articles(status);')
      expect(indexes).toContain('CREATE INDEX IF NOT EXISTS idx_articles_title ON content_articles(title);')
      expect(indexes).toContain('CREATE INDEX IF NOT EXISTS idx_articles_price ON content_articles(price);')
    })
  })

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
  })

  describe('Serialization / Deserialization', () => {
    const textBranch: Branch = { alias: 't', type: 'text', label: 'T' }
    const boolBranch: Branch = { alias: 'b', type: 'boolean', label: 'B' }
    const jsonBranch: Branch = { alias: 'j', type: 'json', label: 'J' }
    const dateBranch: Branch = { alias: 'd', type: 'date', label: 'D' }

    it('serializes values for DB', () => {
      expect(serializeForDb(boolBranch, true)).toBe(1)
      expect(serializeForDb(boolBranch, false)).toBe(0)
      expect(serializeForDb(jsonBranch, { foo: 'bar' })).toBe('{"foo":"bar"}')
      
      const timestamp = Math.floor(Date.now() / 1000)
      expect(serializeForDb(dateBranch, timestamp)).toBe(timestamp)
    })

    it('deserializes values from DB', () => {
      expect(deserializeFromDb(boolBranch, 1)).toBe(true)
      expect(deserializeFromDb(boolBranch, 0)).toBe(false)
      expect(deserializeFromDb(jsonBranch, '{"foo":"bar"}')).toEqual({ foo: 'bar' })
      
      const dateStr = '2023-10-27T10:00:00.000Z'
      const timestamp = Math.floor(new Date(dateStr).getTime() / 1000)
      expect(deserializeFromDb(dateBranch, timestamp)).toBe(new Date(timestamp * 1000).toISOString())
    })
  })
})
