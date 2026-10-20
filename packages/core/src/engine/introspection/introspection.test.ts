// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  introspectTable,
  introspectSchema,
  introspectSeedDefinitions,
  assertSafeIdentifier,
  listTables,
  IntrospectionError,
  type SchemaQueryExecutor,
} from './introspection.js'

function fakeExecutor(responses: Record<string, Record<string, unknown>[]>): SchemaQueryExecutor {
  return {
    all: <T extends Record<string, unknown>>(sql: string): Promise<T[]> => {
      const rows = responses[sql]
      // An unstubbed statement must fail loudly: a silent [] would let a test pass against a
      // primitive that changed the SQL it issues.
      if (!rows) return Promise.reject(new Error(`unstubbed statement: ${sql}`))
      return Promise.resolve(rows as T[])
    },
  }
}

describe('introspectTable', () => {
  it('maps PRAGMA table_info rows to columns with upper-cased types and boolean flags', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'id', type: 'text', notnull: 1, dflt_value: null, pk: 1 },
        { cid: 1, name: 'title', type: 'text', notnull: 0, dflt_value: 'untitled', pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [],
      'PRAGMA index_list(content_posts)': [],
    })

    const table = await introspectTable(executor, 'content_posts')

    expect(table.exists).toBe(true)
    expect(table.columns).toEqual([
      { name: 'id', sqlType: 'TEXT', notNull: true, isPk: true, defaultValue: null },
      { name: 'title', sqlType: 'TEXT', notNull: false, isPk: false, defaultValue: 'untitled' },
    ])
  })

  it('reports exists: false for a table PRAGMA answers with zero rows', async () => {
    const executor = fakeExecutor({ 'PRAGMA table_info(content_missing)': [] })

    const table = await introspectTable(executor, 'content_missing')

    expect(table).toEqual({ name: 'content_missing', exists: false, columns: [], foreignKeys: [], indexes: [] })
  })

  it('reports exists: false when the executor rejects, so a missing table is a diff outcome not a crash', async () => {
    const rejecting: SchemaQueryExecutor = { all: () => Promise.reject(new Error('no such table')) }

    const table = await introspectTable(rejecting, 'content_ghost')

    expect(table.exists).toBe(false)
  })

  it('excludes sqlite_autoindex_* entries and sorts the remaining indexes by name', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'id', type: 'text', notnull: 1, dflt_value: null, pk: 1 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [],
      'PRAGMA index_list(content_posts)': [
        { seq: 0, name: 'idx_posts_z', unique: 0 },
        { seq: 1, name: 'sqlite_autoindex_content_posts_1', unique: 1 },
        { seq: 2, name: 'idx_posts_a', unique: 1 },
      ],
    })

    const table = await introspectTable(executor, 'content_posts')

    expect(table.indexes).toEqual([
      { name: 'idx_posts_a', unique: true },
      { name: 'idx_posts_z', unique: false },
    ])
  })

  it('sorts foreign keys by column and upper-cases the ON DELETE rule', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'id', type: 'text', notnull: 1, dflt_value: null, pk: 1 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [
        { id: 0, seq: 0, table: 'content_team', from: 'team_id', to: 'id', on_update: 'no action', on_delete: 'set null' },
        { id: 1, seq: 0, table: 'content_authors', from: 'author_id', to: 'id', on_update: 'no action', on_delete: 'cascade' },
      ],
      'PRAGMA index_list(content_posts)': [],
    })

    const table = await introspectTable(executor, 'content_posts')

    expect(table.foreignKeys.map(fk => fk.column)).toEqual(['author_id', 'team_id'])
    expect(table.foreignKeys[0].onDelete).toBe('CASCADE')
  })

  it('falls back to an empty string for a null column type, ON DELETE or ON UPDATE rule', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'weird', type: null, notnull: 0, dflt_value: null, pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [
        { id: 0, seq: 0, table: 'content_team', from: 'team_id', to: 'id', on_update: null, on_delete: null },
      ],
      'PRAGMA index_list(content_posts)': [],
    })

    const table = await introspectTable(executor, 'content_posts')

    expect(table.columns[0].sqlType).toBe('')
    expect(table.foreignKeys[0].onDelete).toBe('')
    expect(table.foreignKeys[0].onUpdate).toBe('')
  })

  it('breaks a column-name tie in foreign-key sort order by target table', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'ref_id', type: 'text', notnull: 0, dflt_value: null, pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [
        { id: 0, seq: 0, table: 'content_zebras', from: 'ref_id', to: 'id', on_update: 'no action', on_delete: 'set null' },
        { id: 1, seq: 0, table: 'content_authors', from: 'ref_id', to: 'id', on_update: 'no action', on_delete: 'set null' },
      ],
      'PRAGMA index_list(content_posts)': [],
    })

    const table = await introspectTable(executor, 'content_posts')

    expect(table.foreignKeys.map(fk => fk.targetTable)).toEqual(['content_authors', 'content_zebras'])
  })

  it('defaults a null foreign-key target column to id', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'id', type: 'text', notnull: 1, dflt_value: null, pk: 1 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [
        { id: 0, seq: 0, table: 'content_team', from: 'team_id', to: null, on_update: 'no action', on_delete: 'set null' },
      ],
      'PRAGMA index_list(content_posts)': [],
    })

    const table = await introspectTable(executor, 'content_posts')

    expect(table.foreignKeys[0].targetColumn).toBe('id')
  })
})

describe('assertSafeIdentifier', () => {
  it('rejects an identifier carrying a quote or a semicolon with IntrospectionError', () => {
    // Regression guard: these table names would otherwise reach a PRAGMA by string
    // interpolation (see introspection.ts SAFE_IDENTIFIER doc comment).
    const unsafeIdentifiers = ['content_posts; DROP TABLE users', "a'b", '1bad', '']

    for (const identifier of unsafeIdentifiers) {
      expect(() => assertSafeIdentifier(identifier)).toThrow(IntrospectionError)
    }
  })
})

describe('listTables', () => {
  it('lists every non-sqlite table with no LIKE filter when called without a prefix', async () => {
    const executor = fakeExecutor({
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC":
        [{ name: 'seeds' }, { name: 'content_posts' }],
    })

    const names = await listTables(executor)

    expect(names).toEqual(['seeds', 'content_posts'])
  })
})

describe('introspectSchema', () => {
  it('introspects every content_ table listed by sqlite_master, sorted by name', async () => {
    const executor = fakeExecutor({
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name LIKE 'content_%' ORDER BY name ASC":
        [{ name: 'content_posts' }, { name: 'content_authors' }],
      'PRAGMA table_info(content_authors)': [{ cid: 0, name: 'id', type: 'text', notnull: 1, dflt_value: null, pk: 1 }],
      'PRAGMA foreign_key_list(content_authors)': [],
      'PRAGMA index_list(content_authors)': [],
      'PRAGMA table_info(content_posts)': [{ cid: 0, name: 'id', type: 'text', notnull: 1, dflt_value: null, pk: 1 }],
      'PRAGMA foreign_key_list(content_posts)': [],
      'PRAGMA index_list(content_posts)': [],
    })

    const schema = await introspectSchema(executor)

    expect(schema.tables.map(t => t.name)).toEqual(['content_authors', 'content_posts'])
  })
})

describe('introspectSeedDefinitions', () => {
  it('parses each active seed definition into a Seed', async () => {
    const executor = fakeExecutor({
      "SELECT slug, definition FROM seeds WHERE status = 'active' ORDER BY slug ASC": [
        { slug: 'posts', definition: JSON.stringify({ slug: 'posts', label: 'Post', displayNameAlias: 'title', branches: [] }) },
      ],
    })

    const seeds = await introspectSeedDefinitions(executor)

    expect(seeds).toEqual([{ slug: 'posts', label: 'Post', displayNameAlias: 'title', branches: [] }])
  })

  it('throws IntrospectionError when the executor rejects the seeds read', async () => {
    const rejecting: SchemaQueryExecutor = { all: () => Promise.reject(new Error('D1 unavailable')) }

    await expect(introspectSeedDefinitions(rejecting)).rejects.toThrow(IntrospectionError)
  })

  it('throws IntrospectionError naming the slug whose definition is not valid JSON', async () => {
    const executor = fakeExecutor({
      "SELECT slug, definition FROM seeds WHERE status = 'active' ORDER BY slug ASC": [
        { slug: 'broken', definition: '{not json' },
      ],
    })

    await expect(introspectSeedDefinitions(executor)).rejects.toThrow(IntrospectionError)
    await expect(introspectSeedDefinitions(executor)).rejects.toThrow(/broken/)
  })
})
