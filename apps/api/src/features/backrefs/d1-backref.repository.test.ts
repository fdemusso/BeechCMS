// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { BackrefSource, Seed } from '@beechcms/core'
import { D1BackrefRepository } from './d1-backref.repository'

function makeMockDb() {
  const preparedStatements: { sql: string; bindings: unknown[] }[] = []
  const db = {
    prepare: vi.fn((sql: string) => {
      let boundArgs: unknown[] = []
      const stmt = {
        bind: vi.fn((...args: unknown[]) => {
          boundArgs = args
          preparedStatements.push({ sql, bindings: boundArgs })
          return stmt
        }),
        first: vi.fn().mockResolvedValue({ id: 'target-1', total: 1 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }
      return stmt
    }),
    preparedStatements,
  }
  return db
}

const softDeleteSeed: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  softDelete: true,
  branches: [],
}

const plainSeed: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  softDelete: false,
  branches: [],
}

describe('D1BackrefRepository unit tests', () => {
  describe('entryExists', () => {
    it('appends AND deleted_at IS NULL when seed has softDelete: true', async () => {
      const db = makeMockDb()
      const repo = new D1BackrefRepository(db as unknown as D1Database)

      await repo.entryExists(softDeleteSeed, 'post-1')

      expect(db.prepare).toHaveBeenCalledWith(
        'SELECT id FROM content_posts WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      )
    })

    it('does not append deleted_at filter when seed has softDelete: false', async () => {
      const db = makeMockDb()
      const repo = new D1BackrefRepository(db as unknown as D1Database)

      await repo.entryExists(plainSeed, 'post-1')

      expect(db.prepare).toHaveBeenCalledWith(
        'SELECT id FROM content_posts WHERE id = ? LIMIT 1',
      )
    })

    it('does not append deleted_at filter when called with string slug (backwards compat)', async () => {
      const db = makeMockDb()
      const repo = new D1BackrefRepository(db as unknown as D1Database)

      await repo.entryExists('posts', 'post-1')

      expect(db.prepare).toHaveBeenCalledWith(
        'SELECT id FROM content_posts WHERE id = ? LIMIT 1',
      )
    })
  })

  describe('queryGroup — single relation', () => {
    const singleSource: BackrefSource = {
      sourceSlug: 'posts',
      branchAlias: 'author_id',
      branchLabel: 'Author',
      relationship: 'single',
      restricts: false,
    }

    it('appends AND deleted_at IS NULL to both list and count queries when softDelete is true', async () => {
      const db = makeMockDb()
      const repo = new D1BackrefRepository(db as unknown as D1Database)

      await repo.queryGroup(singleSource, softDeleteSeed, 'author-1', 10, 0)

      const calls = db.prepare.mock.calls.map(c => c[0] as string)
      const listSql = calls.find(s => s.includes('SELECT id, status, updated_at'))
      const countSql = calls.find(s => s.includes('SELECT COUNT(*) AS total'))

      expect(listSql).toContain('WHERE author_id = ? AND deleted_at IS NULL')
      expect(countSql).toContain('WHERE author_id = ? AND deleted_at IS NULL')
    })

    it('does not include deleted_at in queries when softDelete is false', async () => {
      const db = makeMockDb()
      const repo = new D1BackrefRepository(db as unknown as D1Database)

      await repo.queryGroup(singleSource, plainSeed, 'author-1', 10, 0)

      const calls = db.prepare.mock.calls.map(c => c[0] as string)
      const listSql = calls.find(s => s.includes('SELECT id, status, updated_at'))
      const countSql = calls.find(s => s.includes('SELECT COUNT(*) AS total'))

      expect(listSql).not.toContain('deleted_at')
      expect(countSql).not.toContain('deleted_at')
    })
  })

  describe('queryGroup — multi relation', () => {
    const multiSource: BackrefSource = {
      sourceSlug: 'posts',
      branchAlias: 'tags',
      branchLabel: 'Tags',
      relationship: 'multi',
      restricts: false,
    }

    it('filters c.deleted_at IS NULL in list query and joins source table with deleted_at IS NULL in count query when softDelete is true', async () => {
      const db = makeMockDb()
      const repo = new D1BackrefRepository(db as unknown as D1Database)

      await repo.queryGroup(multiSource, softDeleteSeed, 'tag-1', 10, 0)

      const calls = db.prepare.mock.calls.map(c => c[0] as string)
      const listSql = calls.find(s => s.includes('SELECT c.id, c.status'))
      const countSql = calls.find(s => s.includes('SELECT COUNT(DISTINCT'))

      expect(listSql).toContain('WHERE r.target_id = ? AND c.deleted_at IS NULL')
      expect(countSql).toBe(
        'SELECT COUNT(DISTINCT r.parent_id) AS total FROM rel_posts_tags r JOIN content_posts c ON r.parent_id = c.id WHERE r.target_id = ? AND c.deleted_at IS NULL',
      )
    })

    it('does not join or filter by deleted_at when softDelete is false', async () => {
      const db = makeMockDb()
      const repo = new D1BackrefRepository(db as unknown as D1Database)

      await repo.queryGroup(multiSource, plainSeed, 'tag-1', 10, 0)

      const calls = db.prepare.mock.calls.map(c => c[0] as string)
      const listSql = calls.find(s => s.includes('SELECT c.id, c.status'))
      const countSql = calls.find(s => s.includes('SELECT COUNT(DISTINCT'))

      expect(listSql).not.toContain('c.deleted_at')
      expect(countSql).toBe(
        'SELECT COUNT(DISTINCT parent_id) AS total FROM rel_posts_tags WHERE target_id = ?',
      )
    })
  })
})
