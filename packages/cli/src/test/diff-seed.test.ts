// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Seed, SchemaQueryExecutor } from '@beechcms/core'
import { getExpectedColumns } from '@beechcms/core'
import { diffSeed, isSeedClean } from '../lib/schema-diff.js'

function fakeExecutor(responses: Record<string, Record<string, unknown>[]>): SchemaQueryExecutor {
  return {
    all: <T extends Record<string, unknown>>(sql: string): Promise<T[]> => {
      const rows = responses[sql]
      if (!rows) return Promise.reject(new Error(`unstubbed statement: ${sql}`))
      return Promise.resolve(rows as T[])
    },
  }
}

const ARTICLE_SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
  ],
}

describe('diffSeed', () => {
  it('reports every expected column as missing when the table does not exist', async () => {
    const executor = fakeExecutor({ 'PRAGMA table_info(content_articles)': [] })

    const diff = await diffSeed(ARTICLE_SEED, executor)

    expect(diff.tableExists).toBe(false)
    // Includes the system columns (id, slug, status, created_at, updated_at) getExpectedColumns
    // always adds on top of the seed's own branches.
    expect(diff.columns).toEqual(
      getExpectedColumns(ARTICLE_SEED).map(c => ({ name: c.name, status: 'missing', expectedType: c.sqlType })),
    )
  })

  it('flags a column whose declared type diverges from the branch type', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_articles)': [
        { cid: 0, name: 'title', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_articles)': [],
      'PRAGMA index_list(content_articles)': [],
    })

    const diff = await diffSeed(ARTICLE_SEED, executor)

    expect(diff.columns).toContainEqual({ name: 'title', status: 'type_mismatch', expectedType: 'TEXT', actualType: 'INTEGER' })
  })

  it('flags a database column no branch declares as extra', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_articles)': [
        { cid: 0, name: 'title', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 1, name: 'legacy_col', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_articles)': [],
      'PRAGMA index_list(content_articles)': [],
    })

    const diff = await diffSeed(ARTICLE_SEED, executor)

    expect(diff.columns).toContainEqual({ name: 'legacy_col', status: 'extra', actualType: 'TEXT' })
  })

  it('flags a relation column with no foreign key as fk_missing', async () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
        { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' },
      ],
    }
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'title', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        { cid: 1, name: 'author_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [],
      'PRAGMA index_list(content_posts)': [{ seq: 0, name: 'idx_posts_author_id', unique: 0 }],
    })

    const diff = await diffSeed(seed, executor)

    expect(diff.columns).toContainEqual({ name: 'author_id', status: 'fk_missing', expectedTarget: 'authors' })
  })

  it('flags a foreign key pointing at the wrong table or ON DELETE rule as fk_mismatch', async () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors', onDelete: 'SET NULL' },
      ],
    }
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'author_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [
        { id: 0, seq: 0, table: 'content_team', from: 'author_id', to: 'id', on_update: 'no action', on_delete: 'cascade' },
      ],
      'PRAGMA index_list(content_posts)': [{ seq: 0, name: 'idx_posts_author_id', unique: 0 }],
    })

    const diff = await diffSeed(seed, executor)

    expect(diff.columns).toContainEqual({
      name: 'author_id',
      status: 'fk_mismatch',
      expected: '→ content_authors(id) ON DELETE SET NULL',
      actual: '→ content_team(id) ON DELETE CASCADE',
      expectedTarget: 'authors',
    })
  })

  it('flags a relation column whose idx_{slug}_{alias} index is absent as index_missing', async () => {
    const seed: Seed = {
      slug: 'posts',
      label: 'Post',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' },
      ],
    }
    const executor = fakeExecutor({
      'PRAGMA table_info(content_posts)': [
        { cid: 0, name: 'author_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ],
      'PRAGMA foreign_key_list(content_posts)': [
        { id: 0, seq: 0, table: 'content_authors', from: 'author_id', to: 'id', on_update: 'no action', on_delete: 'set null' },
      ],
      'PRAGMA index_list(content_posts)': [],
    })

    const diff = await diffSeed(seed, executor)

    expect(diff.columns).toContainEqual({ name: 'author_id', status: 'index_missing' })
  })

  it('returns a clean diff for a table matching its seed, so isSeedClean holds', async () => {
    const executor = fakeExecutor({
      'PRAGMA table_info(content_articles)': getExpectedColumns(ARTICLE_SEED).map((c, cid) => ({
        cid, name: c.name, type: c.sqlType, notnull: c.notNull ? 1 : 0, dflt_value: null, pk: c.isPk ? 1 : 0,
      })),
      'PRAGMA foreign_key_list(content_articles)': [],
      'PRAGMA index_list(content_articles)': [],
    })

    const diff = await diffSeed(ARTICLE_SEED, executor)

    expect(isSeedClean(diff)).toBe(true)
  })
})
