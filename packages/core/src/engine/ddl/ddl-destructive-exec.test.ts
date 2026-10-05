// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { generateDropColumn, generateRetypeColumn } from './ddl.js'
import { planCreateSeed, planFtsRebuild } from './seed-ddl.js'
import type { Seed } from '../types.js'

const seed: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: { search: true } },
    { id: 'br_02', alias: 'price', label: 'Price', type: 'number' },
    { id: 'br_03', alias: 'notes', label: 'Notes', type: 'text', policies: { filter: false, search: false } },
  ],
}

function bootDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  for (const stmt of planCreateSeed(seed)) db.exec(stmt)
  return db
}

function columnsOf(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name)
}

describe('generateDropColumn — executed against SQLite', () => {
  it('drops an indexed column and its index', () => {
    const db = bootDb()
    for (const stmt of generateDropColumn(seed, 'price')) db.exec(stmt)
    expect(columnsOf(db, 'content_articles')).not.toContain('price')
    expect(columnsOf(db, 'content_articles_drafts')).not.toContain('price')
  })

  it('drops a searchable column once FTS is rebuilt on the remaining branches', () => {
    const db = bootDb()
    const updated: Seed = { ...seed, branches: seed.branches.filter(b => b.alias !== 'title') }
    for (const stmt of [...generateDropColumn(seed, 'title'), ...planFtsRebuild(updated)]) db.exec(stmt)
    expect(columnsOf(db, 'content_articles')).not.toContain('title')
    db.exec(`INSERT INTO content_articles (id, slug, status, price) VALUES ('a', 'a', 'draft', 1)`)
  })

  it('drops a non-indexed column unchanged', () => {
    const db = bootDb()
    for (const stmt of generateDropColumn(seed, 'notes')) db.exec(stmt)
    expect(columnsOf(db, 'content_articles')).not.toContain('notes')
  })
})

describe('generateRetypeColumn — executed against SQLite', () => {
  it('retypes an indexed column, keeps data, and restores its index', () => {
    const db = bootDb()
    db.exec(`INSERT INTO content_articles (id, slug, status, price) VALUES ('a', 'a', 'draft', 12.5)`)
    const target = { id: 'br_02', alias: 'price', label: 'Price', type: 'text' as const }
    for (const stmt of generateRetypeColumn(seed, target)) db.exec(stmt)
    const row = db.prepare(`SELECT price FROM content_articles WHERE id = 'a'`).get() as { price: string }
    expect(row.price).toBe('12.5')
    const indexes = db.prepare(`PRAGMA index_list(content_articles)`).all() as { name: string }[]
    expect(indexes.map(i => i.name)).toContain('idx_articles_price')
  })

  it('retypes a searchable column and rebuilds FTS afterwards', () => {
    const db = bootDb()
    db.exec(`INSERT INTO content_articles (id, slug, status, title) VALUES ('a', 'a', 'draft', 'hello')`)
    const target = { id: 'br_01', alias: 'title', label: 'Title', type: 'richtext' as const }
    const retyped: Seed = { ...seed, branches: seed.branches.map(b => (b.id === 'br_01' ? { ...b, type: 'richtext' as const } : b)) }
    for (const stmt of [...generateRetypeColumn(seed, target), ...planFtsRebuild(retyped)]) db.exec(stmt)
    const hit = db.prepare(`SELECT entry_id FROM fts_articles WHERE fts_articles MATCH 'hello'`).get() as { entry_id: string }
    expect(hit.entry_id).toBe('a')
  })
})
