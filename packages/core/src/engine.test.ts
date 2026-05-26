// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { 
  generateCreateTable, 
  generateDraftTable, 
  generateIndexes, 
  generateAddColumn,
  generateFtsTable,
  generateFtsTriggers,
  getExpectedColumns,
  buildSelectQuery,
  serializeForDb,
  deserializeFromDb
} from './engine.js'
import type { Seed, Branch } from './types.js'

const mockSeed: Seed = {
  slug: 'articles',
  label: 'Articles',
  allowDrafts: true,
  displayNameAlias: 'title',
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

    it('generates a valid ALTER TABLE statement for a branch', () => {
      const branch: Branch = { alias: 'new_field', type: 'text', label: 'New Field' }
      const sql = generateAddColumn(mockSeed, branch)
      expect(sql).toBe('ALTER TABLE content_articles ADD COLUMN new_field TEXT;')
    })

    it('generates FTS table if search branches exist', () => {
      const sql = generateFtsTable(mockSeed)
      expect(sql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS fts_articles USING fts5')
      expect(sql).toContain('  title')
      expect(sql).toContain('  content')
    })

    it('returns null for FTS table if no search branches exist', () => {
      const noSearchSeed: Seed = {
        ...mockSeed,
        branches: [{ alias: 'price', type: 'number', label: 'Price' }]
      }
      expect(generateFtsTable(noSearchSeed)).toBeNull()
    })

    it('generates FTS triggers if search branches exist', () => {
      const triggers = generateFtsTriggers(mockSeed)
      expect(triggers.length).toBe(3)
      expect(triggers[0]).toContain('CREATE TRIGGER IF NOT EXISTS fts_articles_insert')
      expect(triggers[1]).toContain('CREATE TRIGGER IF NOT EXISTS fts_articles_update')
      expect(triggers[2]).toContain('CREATE TRIGGER IF NOT EXISTS fts_articles_delete')
    })

    it('returns empty array for FTS triggers if no search branches exist', () => {
      const noSearchSeed: Seed = {
        ...mockSeed,
        branches: [{ alias: 'price', type: 'number', label: 'Price' }]
      }
      expect(generateFtsTriggers(noSearchSeed)).toEqual([])
    })

    it('returns expected columns for the seed', () => {
      const cols = getExpectedColumns(mockSeed)
      expect(cols.find(c => c.name === 'id')).toEqual({ name: 'id', sqlType: 'TEXT', notNull: true, isPk: true })
      expect(cols.find(c => c.name === 'title')).toEqual({ name: 'title', sqlType: 'TEXT', notNull: true, isPk: false })
      expect(cols.find(c => c.name === 'content')).toEqual({ name: 'content', sqlType: 'TEXT', notNull: false, isPk: false })
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
      expect(query.sql).toContain("EXISTS (SELECT 1 FROM json_each(tags) WHERE value IN (?))")
      expect(query.sql).toContain("(EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?) AND EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?))")
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

    it('handles null and undefined', () => {
      expect(serializeForDb(boolBranch, null)).toBeNull()
      expect(serializeForDb(boolBranch, undefined)).toBeNull()
      expect(deserializeFromDb(boolBranch, null)).toBeNull()
      expect(deserializeFromDb(boolBranch, undefined)).toBeNull()
    })

    it('serializes and deserializes date strings properly', () => {
      const dateStr = '2023-10-27T00:00:00.000Z'
      const timestamp = Math.floor(new Date(dateStr).getTime() / 1000)
      
      const dateOnlyBranch: Branch = { alias: 'd', type: 'date', label: 'D', format: 'date' }
      
      // serialization
      expect(serializeForDb(dateOnlyBranch, dateStr)).toBe(timestamp)
      // invalid date
      expect(serializeForDb(dateOnlyBranch, 'invalid')).toBeNull()

      // deserialization
      expect(deserializeFromDb(dateOnlyBranch, timestamp)).toBe('2023-10-27')
    })

    it('serializes and deserializes asset lists properly', () => {
      const assetListBranch: Branch = { alias: 'f', type: 'file', label: 'F', multiple: true }
      expect(serializeForDb(assetListBranch, ['https://a.com', 'https://b.com'])).toBe('["https://a.com","https://b.com"]')
      expect(deserializeFromDb(assetListBranch, '["https://a.com","https://b.com"]')).toEqual(['https://a.com', 'https://b.com'])
      expect(deserializeFromDb(assetListBranch, ['https://a.com'])).toEqual(['https://a.com'])
    })
  })
})
