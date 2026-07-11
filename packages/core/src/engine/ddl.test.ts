// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest'
import type { Seed, Branch } from './types.js'
import {
  generateCreateTable,
  generateDraftTable,
  generateIndexes,
  generateAddColumn,
  generateFtsTable,
  generateFtsTriggers,
  getExpectedColumns,
  junctionTableName,
  generateJunctionTable,
  generateJunctionIndexes,
  generateJunctionDraftTable,
  indexableSearchBranches,
} from './ddl.js'
import { serializeForDb, deserializeFromDb } from './serialize.js'

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

describe('DDL', () => {
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
      const branch: Branch = { id: 'br_new_field', alias: 'new_field', type: 'text', label: 'New Field' }
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
        branches: [{ id: 'br_price', alias: 'price', type: 'number', label: 'Price' }]
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
        branches: [{ id: 'br_price', alias: 'price', type: 'number', label: 'Price' }]
      }
      expect(generateFtsTriggers(noSearchSeed)).toEqual([])
    })

    it('excludes non-public branches from indexable search branches (#234)', () => {
      const seed: Seed = {
        ...mockSeed,
        branches: [
          { id: 'br_name', alias: 'name', type: 'text', label: 'Name' },
          { id: 'br_ssn', alias: 'ssn', type: 'text', label: 'SSN', policies: { public: false } },
        ]
      }
      const aliases = indexableSearchBranches(seed).map(b => b.alias)
      expect(aliases).toEqual(['name'])
    })

    it('excludes non-public branches from the FTS table (#234)', () => {
      const seed: Seed = {
        ...mockSeed,
        branches: [
          { id: 'br_name', alias: 'name', type: 'text', label: 'Name' },
          { id: 'br_ssn', alias: 'ssn', type: 'text', label: 'SSN', policies: { public: false } },
        ]
      }
      const sql = generateFtsTable(seed)
      expect(sql).toContain('  name')
      expect(sql).not.toContain('ssn')
    })

    it('returns expected columns for the seed', () => {
      const cols = getExpectedColumns(mockSeed)
      expect(cols.find(c => c.name === 'id')).toEqual({ name: 'id', sqlType: 'TEXT', notNull: true, isPk: true })
      expect(cols.find(c => c.name === 'title')).toEqual({ name: 'title', sqlType: 'TEXT', notNull: true, isPk: false })
      expect(cols.find(c => c.name === 'content')).toEqual({ name: 'content', sqlType: 'TEXT', notNull: false, isPk: false })
    })
  })
  describe('relation branches', () => {
    const relationSeed: Seed = {
      slug: 'articles',
      label: 'Articles',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_title', alias: 'title', type: 'text', label: 'Title', requiredOnCreate: true },
        { id: 'br_author_id', alias: 'author_id', type: 'relation', label: 'Author', targetSeed: 'team' },
      ],
    }

    it('BRANCH_TYPE_SQL maps relation to TEXT', () => {
      // Verify via DDL output — relation column must be TEXT
      const sql = generateCreateTable(relationSeed)
      expect(sql).toContain('author_id  TEXT REFERENCES')
    })

    it('generateCreateTable emits FK clause with default SET NULL', () => {
      const sql = generateCreateTable(relationSeed)
      expect(sql).toContain('author_id  TEXT REFERENCES content_team(id) ON DELETE SET NULL')
    })

    it('generateCreateTable emits FK clause with onDelete CASCADE', () => {
      const seed: Seed = {
        ...relationSeed,
        branches: [
          { id: 'br_author_id', alias: 'author_id', type: 'relation', label: 'Author', targetSeed: 'team', onDelete: 'CASCADE' },
        ],
      }
      const sql = generateCreateTable(seed)
      expect(sql).toContain('author_id  TEXT REFERENCES content_team(id) ON DELETE CASCADE')
    })

    it('generateCreateTable emits FK clause with onDelete RESTRICT', () => {
      const seed: Seed = {
        ...relationSeed,
        branches: [
          { id: 'br_author_id', alias: 'author_id', type: 'relation', label: 'Author', targetSeed: 'team', onDelete: 'RESTRICT' },
        ],
      }
      const sql = generateCreateTable(seed)
      expect(sql).toContain('author_id  TEXT REFERENCES content_team(id) ON DELETE RESTRICT')
    })

    it('generateCreateTable throws when targetSeed is missing', () => {
      const seed: Seed = {
        ...relationSeed,
        branches: [
          { id: 'br_author_id', alias: 'author_id', type: 'relation', label: 'Author' },
        ],
      }
      expect(() => generateCreateTable(seed)).toThrow(/author_id/)
      expect(() => generateCreateTable(seed)).toThrow(/targetSeed/)
    })

    it('generateAddColumn emits ALTER TABLE with FK clause', () => {
      const branch: Branch = { id: 'br_author_id', alias: 'author_id', type: 'relation', label: 'Author', targetSeed: 'team' }
      const sql = generateAddColumn(relationSeed, branch)
      expect(sql).toBe(
        'ALTER TABLE content_articles ADD COLUMN author_id TEXT REFERENCES content_team(id) ON DELETE SET NULL;',
      )
    })

    it('generateIndexes always emits B-tree index for relation branches', () => {
      const seedNoFilter: Seed = {
        ...relationSeed,
        branches: [
          { id: 'br_author_id', alias: 'author_id',
            type: 'relation',
            label: 'Author',
            targetSeed: 'team',
            policies: { filter: false },
          },
        ],
      }
      const indexes = generateIndexes(seedNoFilter)
      expect(indexes).toContain(
        'CREATE INDEX IF NOT EXISTS idx_articles_author_id ON content_articles(author_id);',
      )
    })

    it('draft mirror table must NOT contain REFERENCES for relation columns', () => {
      const draftSeed: Seed = {
        ...relationSeed,
        allowDrafts: true,
      }
      const sql = generateDraftTable(draftSeed)
      expect(sql).not.toBeNull()
      // Remove the system-level entry_id REFERENCES line, then check no branch-level FK exists
      const withoutSystemFk = sql!.replace(/REFERENCES content_articles\(id\) ON DELETE CASCADE/, '')
      expect(withoutSystemFk).not.toContain('REFERENCES')
    })
  })
  describe('many-to-many (Sprint 5)', () => {
    const multiRelSeed: Seed = {
      slug: 'articles',
      label: 'Articles',
      allowDrafts: true,
      displayNameAlias: 'title',
      branches: [
        { id: 'br_title', alias: 'title', type: 'text', label: 'Title', requiredOnCreate: true },
        { id: 'br_tags', alias: 'tags', type: 'relation', label: 'Tags', targetSeed: 'tag', multiple: true, onDelete: 'CASCADE' },
      ],
    }

    it('junctionTableName returns rel_<seed>_<alias>', () => {
      expect(junctionTableName('articles', 'tags')).toBe('rel_articles_tags')
    })

    it('generateJunctionTable produces correct DDL with CASCADE target', () => {
      const sql = generateJunctionTable(multiRelSeed, multiRelSeed.branches[1])
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS rel_articles_tags')
      expect(sql).toContain('parent_id  TEXT NOT NULL REFERENCES content_articles(id)    ON DELETE CASCADE')
      expect(sql).toContain('target_id  TEXT NOT NULL REFERENCES content_tag(id) ON DELETE CASCADE')
      expect(sql).toContain('position   INTEGER NOT NULL DEFAULT 0')
      expect(sql).toContain('PRIMARY KEY (parent_id, target_id)')
    })

    it('generateJunctionTable defaults onDelete to CASCADE when not specified', () => {
      const seed: Seed = {
        ...multiRelSeed,
        branches: [{ id: 'br_co_authors', alias: 'co_authors', type: 'relation', label: 'Co-authors', targetSeed: 'team', multiple: true }],
      }
      const sql = generateJunctionTable(seed, seed.branches[0])
      expect(sql).toContain('ON DELETE CASCADE')
    })

    it('generateJunctionTable throws for non-multi-relation branch', () => {
      expect(() => generateJunctionTable(multiRelSeed, multiRelSeed.branches[0])).toThrow(/not a multi-relation/)
    })

    it('generateJunctionTable throws when targetSeed is missing', () => {
      const branch: Branch = { id: 'br_tags', alias: 'tags', type: 'relation', label: 'Tags', multiple: true }
      expect(() => generateJunctionTable(multiRelSeed, branch)).toThrow(/targetSeed/)
    })

    it('generateJunctionIndexes emits parent + target indexes', () => {
      const indexes = generateJunctionIndexes(multiRelSeed, multiRelSeed.branches[1])
      expect(indexes).toHaveLength(2)
      expect(indexes[0]).toContain('idx_rel_articles_tags_parent ON rel_articles_tags(parent_id)')
      expect(indexes[1]).toContain('idx_rel_articles_tags_target ON rel_articles_tags(target_id)')
    })

    it('generateCreateTable does NOT include a column for multi-relation branches', () => {
      const sql = generateCreateTable(multiRelSeed)
      expect(sql).not.toContain('tags  TEXT')
    })

    it('generateDraftTable does NOT include a column for multi-relation branches', () => {
      const sql = generateDraftTable(multiRelSeed)
      expect(sql).not.toBeNull()
      expect(sql).not.toContain('tags  TEXT')
    })

    it('generateIndexes does NOT emit an index for multi-relation branches', () => {
      const indexes = generateIndexes(multiRelSeed)
      expect(indexes.some(i => i.includes('idx_articles_tags'))).toBe(false)
    })

    it('getExpectedColumns excludes multi-relation branches', () => {
      const cols = getExpectedColumns(multiRelSeed)
      expect(cols.find(c => c.name === 'tags')).toBeUndefined()
      expect(cols.find(c => c.name === 'title')).toBeDefined()
    })

    it('generateJunctionDraftTable emits correct DDL without FK on target_id', () => {
      const sql = generateJunctionDraftTable(multiRelSeed, multiRelSeed.branches[1])
      expect(sql).not.toBeNull()
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS rel_articles_tags_drafts')
      expect(sql).toContain('REFERENCES content_articles_drafts(entry_id) ON DELETE CASCADE')
      expect(sql).toContain('target_id  TEXT NOT NULL')
      // Must NOT have a FK on target_id — target may be deleted before publish
      const withoutEntryFk = sql!.replace(/REFERENCES content_articles_drafts\(entry_id\) ON DELETE CASCADE/, '')
      expect(withoutEntryFk).not.toContain('REFERENCES')
    })

    it('generateJunctionDraftTable returns null when allowDrafts is false', () => {
      const seed: Seed = { ...multiRelSeed, allowDrafts: false }
      expect(generateJunctionDraftTable(seed, seed.branches[1])).toBeNull()
    })
  })
  describe('repeater branches (Sprint 10)', () => {
    const repeaterBranch: Branch = {
      id: 'br_items', alias: 'items', label: 'Items', type: 'repeater',
      fields: [
        { id: 'br_q', alias: 'question', label: 'Question', type: 'text' },
        { id: 'br_a', alias: 'answer', label: 'Answer', type: 'richtext' },
      ],
    }
    const repeaterSeed: Seed = {
      slug: 'faq',
      label: 'FAQ',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_title', alias: 'title', label: 'Title', type: 'text', policies: { search: true } },
        repeaterBranch,
      ],
    }

    it('generateCreateTable emits a nullable TEXT column for a repeater branch', () => {
      const sql = generateCreateTable(repeaterSeed)
      expect(sql).toContain('items  TEXT')
      expect(sql).not.toContain('items  TEXT NOT NULL')
    })

    it('generateAddColumn emits a TEXT column for a repeater branch', () => {
      expect(generateAddColumn(repeaterSeed, repeaterBranch)).toBe('ALTER TABLE content_faq ADD COLUMN items TEXT;')
    })

    it('getExpectedColumns includes the repeater column as TEXT', () => {
      const cols = getExpectedColumns(repeaterSeed)
      expect(cols.find(c => c.name === 'items')).toEqual({ name: 'items', sqlType: 'TEXT', notNull: false, isPk: false })
    })

    it('generateIndexes does not index a repeater branch', () => {
      const indexes = generateIndexes(repeaterSeed)
      expect(indexes.some(i => i.includes('idx_faq_items'))).toBe(false)
    })

    it('generateFtsTable/Triggers ignore repeater branches', () => {
      const ftsSql = generateFtsTable(repeaterSeed)
      expect(ftsSql).not.toContain('items')
      const triggers = generateFtsTriggers(repeaterSeed)
      for (const trigger of triggers) {
        expect(trigger).not.toContain('items')
      }
    })

    it('serializeForDb stringifies an array of records', () => {
      const value = [{ question: 'Q1', answer: 'A1' }]
      expect(serializeForDb(repeaterBranch, value)).toBe(JSON.stringify(value))
    })

    it('serializeForDb rejects non-array values by storing an empty list', () => {
      expect(serializeForDb(repeaterBranch, { question: 'Q1' })).toBe('[]')
      expect(serializeForDb(repeaterBranch, 'not-an-array')).toBe('[]')
    })

    it('serializeForDb stores null/undefined as null', () => {
      expect(serializeForDb(repeaterBranch, null)).toBeNull()
      expect(serializeForDb(repeaterBranch, undefined)).toBeNull()
    })

    it('deserializeFromDb parses a JSON array back into records', () => {
      const value = [{ question: 'Q1', answer: 'A1' }]
      expect(deserializeFromDb(repeaterBranch, JSON.stringify(value))).toEqual(value)
    })

    it('deserializeFromDb coerces null/empty/invalid to []', () => {
      expect(deserializeFromDb(repeaterBranch, null)).toEqual([])
      expect(deserializeFromDb(repeaterBranch, undefined)).toEqual([])
      expect(deserializeFromDb(repeaterBranch, '')).toEqual([])
      expect(deserializeFromDb(repeaterBranch, 'not-json')).toEqual([])
      expect(deserializeFromDb(repeaterBranch, '{"not":"an-array"}')).toEqual([])
    })
  })
})