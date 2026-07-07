// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  generateDropTable,
  generateDropColumn,
  generateRenameColumn,
  generateRetypeColumn,
} from './engine.js'
import { planFtsRebuild } from './seed-ddl.js'
import type { Seed } from './types.js'

const fullSeed: Seed = {
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { search: true } },
    { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext', policies: { search: true } },
    { id: 'br_03', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true },
    { id: 'br_04', alias: 'views', label: 'Views', type: 'number' },
  ],
}

describe('generateDropTable', () => {
  it('drops the main content table', () => {
    const stmts = generateDropTable(fullSeed)
    expect(stmts.some(s => s === 'DROP TABLE IF EXISTS content_posts;')).toBe(true)
  })

  it('drops the FTS table and its triggers', () => {
    const stmts = generateDropTable(fullSeed)
    expect(stmts.some(s => s.includes('DROP TABLE IF EXISTS fts_posts'))).toBe(true)
    expect(stmts.some(s => s.includes('DROP TRIGGER IF EXISTS fts_posts_insert'))).toBe(true)
    expect(stmts.some(s => s.includes('DROP TRIGGER IF EXISTS fts_posts_update'))).toBe(true)
    expect(stmts.some(s => s.includes('DROP TRIGGER IF EXISTS fts_posts_delete'))).toBe(true)
  })

  it('drops the drafts table when allowDrafts=true', () => {
    const stmts = generateDropTable(fullSeed)
    expect(stmts.some(s => s.includes('DROP TABLE IF EXISTS content_posts_drafts'))).toBe(true)
  })

  it('drops the junction table (+ drafts) for multi-relation branches', () => {
    const stmts = generateDropTable(fullSeed)
    expect(stmts.some(s => s === 'DROP TABLE IF EXISTS rel_posts_tags;')).toBe(true)
    expect(stmts.some(s => s === 'DROP TABLE IF EXISTS rel_posts_tags_drafts;')).toBe(true)
  })

  it('drops junction before main (children first)', () => {
    const stmts = generateDropTable(fullSeed)
    const junctionIdx = stmts.findIndex(s => s === 'DROP TABLE IF EXISTS rel_posts_tags;')
    const mainIdx = stmts.findIndex(s => s === 'DROP TABLE IF EXISTS content_posts;')
    expect(junctionIdx).toBeLessThan(mainIdx)
  })

  it('omits FTS/draft statements for a minimal seed', () => {
    const minimal: Seed = {
      slug: 'logs', label: 'Logs', displayNameAlias: 'code',
      branches: [{ id: 'br_01', alias: 'code', label: 'Code', type: 'text', policies: { search: false } }],
    }
    const stmts = generateDropTable(minimal)
    expect(stmts.some(s => s.includes('fts_logs'))).toBe(false)
    expect(stmts.some(s => s.includes('_drafts'))).toBe(false)
    expect(stmts.some(s => s === 'DROP TABLE IF EXISTS content_logs;')).toBe(true)
  })
})

describe('generateDropColumn', () => {
  it('drops the column from content + drafts table', () => {
    const stmts = generateDropColumn(fullSeed, 'views')
    expect(stmts).toContain('ALTER TABLE content_posts DROP COLUMN views;')
    expect(stmts).toContain('ALTER TABLE content_posts_drafts DROP COLUMN views;')
  })

  it('drops the junction table for a multi-relation branch instead of a column', () => {
    const stmts = generateDropColumn(fullSeed, 'tags')
    expect(stmts.some(s => s.includes('DROP COLUMN'))).toBe(false)
    expect(stmts).toContain('DROP TABLE IF EXISTS rel_posts_tags;')
    expect(stmts).toContain('DROP TABLE IF EXISTS rel_posts_tags_drafts;')
  })

  it('orphan column (no branch) → plain drop, no drafts touch', () => {
    const stmts = generateDropColumn(fullSeed, 'legacy_col')
    expect(stmts).toEqual(['ALTER TABLE content_posts DROP COLUMN legacy_col;'])
  })
})

describe('generateRenameColumn', () => {
  it('renames the column on content + drafts', () => {
    const stmts = generateRenameColumn(fullSeed, 'views', 'view_count')
    expect(stmts).toContain('ALTER TABLE content_posts RENAME COLUMN views TO view_count;')
    expect(stmts).toContain('ALTER TABLE content_posts_drafts RENAME COLUMN views TO view_count;')
  })

  it('renames the junction table for a multi-relation branch', () => {
    const stmts = generateRenameColumn(fullSeed, 'tags', 'labels')
    expect(stmts).toContain('ALTER TABLE rel_posts_tags RENAME TO rel_posts_labels;')
    expect(stmts).toContain('ALTER TABLE rel_posts_tags_drafts RENAME TO rel_posts_labels_drafts;')
  })
})

describe('generateRetypeColumn', () => {
  it('add/copy/drop/rename preserving data via CAST', () => {
    const target = { id: 'br_04', alias: 'views', label: 'Views', type: 'text' as const }
    const stmts = generateRetypeColumn(fullSeed, target)
    expect(stmts).toContain('ALTER TABLE content_posts ADD COLUMN __retype_views TEXT;')
    expect(stmts).toContain('UPDATE content_posts SET __retype_views = CAST(views AS TEXT);')
    expect(stmts).toContain('ALTER TABLE content_posts DROP COLUMN views;')
    expect(stmts).toContain('ALTER TABLE content_posts RENAME COLUMN __retype_views TO views;')
  })

  it('mirrors onto the drafts table', () => {
    const target = { id: 'br_04', alias: 'views', label: 'Views', type: 'text' as const }
    const stmts = generateRetypeColumn(fullSeed, target)
    expect(stmts.some(s => s.includes('content_posts_drafts'))).toBe(true)
  })

  it('rejects a multi-relation branch (no column to retype)', () => {
    const multi = { id: 'br_03', alias: 'tags', label: 'Tags', type: 'relation' as const, targetSeed: 'tags', multiple: true }
    expect(() => generateRetypeColumn(fullSeed, multi)).toThrow()
  })
})

describe('planFtsRebuild', () => {
  it('drops triggers + fts table, recreates them, and backfills', () => {
    const stmts = planFtsRebuild(fullSeed)
    expect(stmts.some(s => s.includes('DROP TRIGGER IF EXISTS fts_posts_insert'))).toBe(true)
    expect(stmts.some(s => s === 'DROP TABLE IF EXISTS fts_posts;')).toBe(true)
    expect(stmts.some(s => s.includes('CREATE VIRTUAL TABLE IF NOT EXISTS fts_posts'))).toBe(true)
    expect(stmts.some(s => s.includes('CREATE TRIGGER IF NOT EXISTS fts_posts_insert'))).toBe(true)
    expect(stmts.some(s => s.startsWith('INSERT INTO fts_posts'))).toBe(true)
  })

  it('drop precedes recreate', () => {
    const stmts = planFtsRebuild(fullSeed)
    const dropIdx = stmts.findIndex(s => s === 'DROP TABLE IF EXISTS fts_posts;')
    const createIdx = stmts.findIndex(s => s.includes('CREATE VIRTUAL TABLE'))
    expect(dropIdx).toBeLessThan(createIdx)
  })

  it('backfill SELECTs id + the searchable columns', () => {
    const stmts = planFtsRebuild(fullSeed)
    const backfill = stmts.find(s => s.startsWith('INSERT INTO fts_posts'))
    expect(backfill).toContain('SELECT id, title, body FROM content_posts')
  })

  it('returns empty for a seed with no searchable branches', () => {
    const minimal: Seed = {
      slug: 'logs', label: 'Logs', displayNameAlias: 'code',
      branches: [{ id: 'br_01', alias: 'code', label: 'Code', type: 'text', policies: { search: false } }],
    }
    expect(planFtsRebuild(minimal)).toEqual([])
  })
})

describe('repeater branches (Sprint 10 — Sprint 06 interaction)', () => {
  const repeaterSeed: Seed = {
    slug: 'faq',
    label: 'FAQ',
    displayNameAlias: 'title',
    allowDrafts: true,
    branches: [
      { id: 'br_title', alias: 'title', label: 'Title', type: 'text', policies: { search: true } },
      {
        id: 'br_items', alias: 'items', label: 'Items', type: 'repeater',
        fields: [{ id: 'br_q', alias: 'question', label: 'Question', type: 'text' }],
      },
    ],
  }

  it('planFtsRebuild produces no FTS statements for the repeater branch', () => {
    const stmts = planFtsRebuild(repeaterSeed)
    for (const s of stmts) {
      expect(s).not.toContain('items')
    }
    // still rebuilds FTS for the searchable `title` branch
    expect(stmts.some(s => s.includes('CREATE VIRTUAL TABLE IF NOT EXISTS fts_faq'))).toBe(true)
  })

  it('generateDropColumn for a repeater branch emits only the column drop (+ drafts mirror)', () => {
    const stmts = generateDropColumn(repeaterSeed, 'items')
    expect(stmts).toEqual([
      'ALTER TABLE content_faq DROP COLUMN items;',
      'ALTER TABLE content_faq_drafts DROP COLUMN items;',
    ])
  })
})
