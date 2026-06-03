// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1ContentRepository } from './content.repository.d1'
import { EntryNotFoundError, SlugConflictError, RelationTargetNotFoundError } from '@beechcms/core'
import type { Seed } from '@beechcms/core'

const SEED = {
  slug: 'posts',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text' },
    { id: 'br_02', alias: 'body', type: 'text' },
  ],
} as unknown as Seed

const NO_DRAFT_SEED = {
  slug: 'produtos',
  displayNameAlias: 'name',
  allowDrafts: false,
  branches: [{ id: 'br_01', alias: 'name', type: 'text' }],
} as unknown as Seed

// Seed with a multi-relation branch
const M2M_SEED = {
  slug: 'articles',
  displayNameAlias: 'title',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text' },
    { id: 'br_02', alias: 'tags', type: 'relation', multiple: true, targetSeed: 'tag' },
  ],
} as unknown as Seed

function makeMockDb(opts: {
  firstResult?: unknown
  allResults?: unknown[]
  runChanges?: number
  batchResults?: unknown[]
} = {}) {
  const { firstResult = null, allResults = [], runChanges = 1, batchResults = [] } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: runChanges } })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  const batchMock = vi.fn().mockResolvedValue(batchResults)
  return { db: { prepare: prepareMock, batch: batchMock } as any, prepareMock, bindMock, runMock, firstMock, allMock, batchMock }
}

// ─── findMany ─────────────────────────────────────────────────────────────────

describe('D1ContentRepository', () => {
  describe('findMany', () => {
    it('returns mapped items and total from batch results', async () => {
      const row = { id: 'e1', slug: 'post-1', status: 'published', title: 'Hello', body: null, created_at: 1000, updated_at: 1000 }
      const { db } = makeMockDb({
        batchResults: [
          { results: [row] },
          { results: [{ total: 1 }] },
        ],
      })
      const result = await new D1ContentRepository(db).findMany(SEED, { pagination: { limit: 10, offset: 0 } })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('e1')
      expect(result.total).toBe(1)
    })

    it('returns empty items and zero total when table is empty', async () => {
      const { db } = makeMockDb({
        batchResults: [{ results: [] }, { results: [{ total: 0 }] }],
      })
      const result = await new D1ContentRepository(db).findMany(SEED, {})
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('wraps D1 errors in RepositoryError', async () => {
      const { db } = makeMockDb()
      db.batch = vi.fn().mockRejectedValue(new Error('D1 error'))
      await expect(new D1ContentRepository(db).findMany(SEED, {})).rejects.toThrow('findMany')
    })
  })

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the entry when found', async () => {
      const row = { id: 'e1', slug: 'p', status: 'draft', title: 'T', body: null, created_at: 0, updated_at: 0 }
      const { db } = makeMockDb({ firstResult: row })
      const result = await new D1ContentRepository(db).findById(SEED, 'e1')
      expect(result.id).toBe('e1')
      expect(result.title).toBe('T')
    })

    it('throws EntryNotFoundError when the row does not exist', async () => {
      const { db } = makeMockDb({ firstResult: null })
      await expect(new D1ContentRepository(db).findById(SEED, 'missing')).rejects.toBeInstanceOf(EntryNotFoundError)
    })

    it('queries the correct content table', async () => {
      const { db, prepareMock } = makeMockDb({ firstResult: { id: 'e1', slug: null, status: 'draft', title: null, body: null } })
      await new D1ContentRepository(db).findById(SEED, 'e1')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('content_posts'))
    })
  })

  // ─── findBySlug ─────────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('returns the entry when the slug is found', async () => {
      const row = { id: 'e1', slug: 'my-post', status: 'published', title: 'T', body: null }
      const { db } = makeMockDb({ firstResult: row })
      const result = await new D1ContentRepository(db).findBySlug(SEED, 'my-post')
      expect(result.slug).toBe('my-post')
    })

    it('throws EntryNotFoundError when slug does not exist', async () => {
      const { db } = makeMockDb({ firstResult: null })
      await expect(new D1ContentRepository(db).findBySlug(SEED, 'ghost')).rejects.toBeInstanceOf(EntryNotFoundError)
    })
  })

  // ─── getFacets ───────────────────────────────────────────────────────────────

  describe('getFacets', () => {
    it('returns status counts mapped from status GROUP BY results', async () => {
      const { db, allMock } = makeMockDb()
      allMock.mockResolvedValueOnce({ results: [{ status: 'published', count: 3 }, { status: 'draft', count: 1 }] })
      const result = await new D1ContentRepository(db).getFacets(SEED)
      expect(result.statuses).toEqual({ published: 3, draft: 1 })
    })

    it('returns empty tagsByColumn when seed has no tag branches', async () => {
      const { db, allMock } = makeMockDb()
      allMock.mockResolvedValueOnce({ results: [] })
      const result = await new D1ContentRepository(db).getFacets(SEED)
      expect(result.tagsByColumn).toEqual({})
    })
  })

  // ─── existsSlug ─────────────────────────────────────────────────────────────

  describe('existsSlug', () => {
    it('returns true when the slug row is found', async () => {
      const { db } = makeMockDb({ firstResult: { 1: 1 } })
      expect(await new D1ContentRepository(db).existsSlug(SEED, 'existing-slug')).toBe(true)
    })

    it('returns false when the slug row is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1ContentRepository(db).existsSlug(SEED, 'new-slug')).toBe(false)
    })

    it('appends AND id != ? clause when excludeId is provided', async () => {
      const { db, bindMock } = makeMockDb({ firstResult: null })
      await new D1ContentRepository(db).existsSlug(SEED, 'slug', 'exclude-me')
      expect(bindMock).toHaveBeenCalledWith('slug', 'exclude-me')
    })
  })

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls INSERT INTO the content table', async () => {
      const { db, prepareMock } = makeMockDb({ firstResult: null }) // existsSlug → null
      await new D1ContentRepository(db).create(SEED, 'new-id', 'my-slug', 'draft', { title: 'Hello' })
      const calls = prepareMock.mock.calls.map(c => c[0] as string)
      expect(calls.some(sql => sql.includes('INSERT INTO content_posts'))).toBe(true)
    })

    it('throws SlugConflictError when the slug already exists', async () => {
      const { db } = makeMockDb({ firstResult: { 1: 1 } }) // existsSlug → found
      await expect(
        new D1ContentRepository(db).create(SEED, 'id', 'taken-slug', 'draft', {}),
      ).rejects.toBeInstanceOf(SlugConflictError)
    })
  })

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls UPDATE with provided status and branch data', async () => {
      const { db, prepareMock, runMock } = makeMockDb({ runChanges: 1 })
      runMock.mockResolvedValue({ success: true, meta: { changes: 1 } })
      await new D1ContentRepository(db).update(SEED, 'e1', { title: 'New' }, 'published')
      const calls = prepareMock.mock.calls.map(c => c[0] as string)
      expect(calls.some(sql => sql.includes('UPDATE content_posts'))).toBe(true)
    })

    it('throws EntryNotFoundError when no rows are updated', async () => {
      const { db } = makeMockDb({ runChanges: 0 })
      await expect(new D1ContentRepository(db).update(SEED, 'ghost', { title: 'X' })).rejects.toBeInstanceOf(EntryNotFoundError)
    })

    it('returns early without a DB call when there is nothing to update', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1ContentRepository(db).update(SEED, 'e1', {}) // no data, no status
      // existsSlug is not called; only prepare calls would be for UPDATE which shouldn't happen
      const updateCalls = prepareMock.mock.calls.filter(c => (c[0] as string).includes('UPDATE content_posts'))
      expect(updateCalls).toHaveLength(0)
    })
  })

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('returns the row data and calls DELETE', async () => {
      const row = { id: 'e1', slug: 'p', status: 'published', title: 'T', body: null }
      const { db, prepareMock } = makeMockDb({ firstResult: row })
      const result = await new D1ContentRepository(db).delete(SEED, 'e1')
      expect(result.row.id).toBe('e1')
      const sqls = prepareMock.mock.calls.map(c => c[0] as string)
      expect(sqls.some(s => s.includes('DELETE FROM content_posts'))).toBe(true)
    })

    it('throws EntryNotFoundError when the entry does not exist', async () => {
      const { db } = makeMockDb({ firstResult: null })
      await expect(new D1ContentRepository(db).delete(SEED, 'missing')).rejects.toBeInstanceOf(EntryNotFoundError)
    })
  })

  // ─── saveDraft ───────────────────────────────────────────────────────────────

  describe('saveDraft', () => {
    it('calls INSERT OR REPLACE into the draft table', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1ContentRepository(db).saveDraft(SEED, 'e1', { title: 'Draft title' })
      const sqls = prepareMock.mock.calls.map(c => c[0] as string)
      expect(sqls.some(s => s.includes('content_posts_drafts'))).toBe(true)
    })

    it('throws RepositoryError when seed does not allow drafts', async () => {
      const { db } = makeMockDb()
      await expect(new D1ContentRepository(db).saveDraft(NO_DRAFT_SEED, 'e1', {})).rejects.toThrow('Drafts not allowed')
    })
  })

  // ─── getDraft ────────────────────────────────────────────────────────────────

  describe('getDraft', () => {
    it('returns null when seed does not allow drafts', async () => {
      const { db } = makeMockDb()
      expect(await new D1ContentRepository(db).getDraft(NO_DRAFT_SEED, 'e1')).toBeNull()
    })

    it('returns null when no draft row exists', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1ContentRepository(db).getDraft(SEED, 'e1')).toBeNull()
    })

    it('returns deserialized draft data for non-null branch values', async () => {
      const draftRow = { entry_id: 'e1', title: 'Draft T', body: null }
      const { db } = makeMockDb({ firstResult: draftRow })
      const result = await new D1ContentRepository(db).getDraft(SEED, 'e1')
      expect(result).not.toBeNull()
      expect(result!.title).toBe('Draft T')
      expect(result).not.toHaveProperty('body') // null branch values are omitted
    })
  })

  // ─── hasDraft ─────────────────────────────────────────────────────────────────

  describe('hasDraft', () => {
    it('returns false immediately when seed does not allow drafts', async () => {
      const { db, prepareMock } = makeMockDb()
      expect(await new D1ContentRepository(db).hasDraft(NO_DRAFT_SEED, 'e1')).toBe(false)
      expect(prepareMock).not.toHaveBeenCalled()
    })

    it('returns true when a draft exists', async () => {
      const { db } = makeMockDb({ firstResult: { 1: 1 } })
      expect(await new D1ContentRepository(db).hasDraft(SEED, 'e1')).toBe(true)
    })

    it('returns false when no draft exists', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1ContentRepository(db).hasDraft(SEED, 'e1')).toBe(false)
    })
  })

  // ─── publishDraft ─────────────────────────────────────────────────────────────

  describe('publishDraft', () => {
    it('returns early when seed does not allow drafts', async () => {
      const { db, batchMock } = makeMockDb()
      await new D1ContentRepository(db).publishDraft(NO_DRAFT_SEED, 'e1')
      expect(batchMock).not.toHaveBeenCalled()
    })

    it('throws EntryNotFoundError when no draft exists', async () => {
      const { db } = makeMockDb({ firstResult: null })
      await expect(new D1ContentRepository(db).publishDraft(SEED, 'e1')).rejects.toBeInstanceOf(EntryNotFoundError)
    })

    it('calls batch with UPDATE and DELETE statements when draft exists', async () => {
      const draftRow = { entry_id: 'e1', title: 'Draft', body: null }
      const { db, batchMock, firstMock } = makeMockDb()
      firstMock.mockResolvedValueOnce(draftRow)
      batchMock.mockResolvedValueOnce([{}, {}])
      await new D1ContentRepository(db).publishDraft(SEED, 'e1')
      expect(batchMock).toHaveBeenCalledTimes(1)
      const batchArgs: any[] = batchMock.mock.calls[0][0]
      expect(batchArgs).toHaveLength(2)
    })
  })

  // ─── deleteDraft ─────────────────────────────────────────────────────────────

  describe('deleteDraft', () => {
    it('returns early when seed does not allow drafts', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1ContentRepository(db).deleteDraft(NO_DRAFT_SEED, 'e1')
      expect(prepareMock).not.toHaveBeenCalled()
    })

    it('calls DELETE on the draft table when drafts are allowed', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1ContentRepository(db).deleteDraft(SEED, 'e1')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('content_posts_drafts'))
    })
  })

  // ─── many-to-many (Sprint 5) ──────────────────────────────────────────────────

  describe('many-to-many relations', () => {
    it('create: multi-relation values go to junction table, not main INSERT', async () => {
      const { db, prepareMock, batchMock } = makeMockDb({ firstResult: null })
      batchMock.mockResolvedValue([{ success: true, meta: { changes: 1 } }])

      await new D1ContentRepository(db).create(
        M2M_SEED, 'e1', 'art-1', 'draft',
        { title: 'Hello', tags: ['tag-1', 'tag-2'] },
      )

      const sqls = prepareMock.mock.calls.map((c: any[]) => c[0] as string)
      // Main INSERT must not contain 'tags'
      const insertSql = sqls.find(s => s.includes('INSERT INTO content_articles '))
      expect(insertSql).toBeDefined()
      expect(insertSql).not.toContain('tags')
      // Junction INSERTs must exist
      const junctionInserts = sqls.filter(s => s.includes('rel_articles_tags'))
      expect(junctionInserts.length).toBeGreaterThan(0)
    })

    it('create: uses batch when multi-relation values present', async () => {
      const { db, batchMock } = makeMockDb({ firstResult: null })
      batchMock.mockResolvedValue([{ success: true }])

      await new D1ContentRepository(db).create(
        M2M_SEED, 'e1', 'art-1', 'draft',
        { title: 'Hello', tags: ['tag-1'] },
      )

      expect(batchMock).toHaveBeenCalled()
    })

    it('update: replaces junction rows (DELETE + INSERT) in batch', async () => {
      const { db, prepareMock, batchMock } = makeMockDb({ runChanges: 1 })
      batchMock.mockResolvedValue([
        { meta: { changes: 1 } },
        { success: true },
        { success: true },
      ])

      await new D1ContentRepository(db).update(
        M2M_SEED, 'e1',
        { tags: ['tag-3', 'tag-4'] },
      )

      const sqls = prepareMock.mock.calls.map((c: any[]) => c[0] as string)
      expect(sqls.some(s => s.includes('DELETE FROM rel_articles_tags WHERE parent_id'))).toBe(true)
      expect(sqls.some(s => s.includes('INSERT INTO rel_articles_tags'))).toBe(true)
    })

    it('update: empty array deletes all junction rows', async () => {
      const { db, prepareMock, batchMock } = makeMockDb({ runChanges: 1 })
      batchMock.mockResolvedValue([{ meta: { changes: 1 } }, { success: true }])

      await new D1ContentRepository(db).update(M2M_SEED, 'e1', { tags: [] })

      const sqls = prepareMock.mock.calls.map((c: any[]) => c[0] as string)
      expect(sqls.some(s => s.includes('DELETE FROM rel_articles_tags WHERE parent_id'))).toBe(true)
      // No INSERT because array is empty
      expect(sqls.filter(s => s.includes('INSERT INTO rel_articles_tags'))).toHaveLength(0)
    })

    it('findById: attaches multi-relation ids from junction table', async () => {
      const row = { id: 'e1', slug: 'art-1', status: 'published', title: 'Hello', created_at: 0, updated_at: 0 }
      const { db, firstMock, batchMock } = makeMockDb({ firstResult: row })
      // First call: main SELECT; batch: junction query
      batchMock.mockResolvedValueOnce([{ results: [{ target_id: 'tag-1' }, { target_id: 'tag-2' }] }])

      const result = await new D1ContentRepository(db).findById(M2M_SEED, 'e1')
      expect(result.tags).toEqual(['tag-1', 'tag-2'])
    })

    it('findById: attaches empty array when no junction rows', async () => {
      const row = { id: 'e1', slug: 'art-1', status: 'published', title: 'Hello', created_at: 0, updated_at: 0 }
      const { db, batchMock } = makeMockDb({ firstResult: row })
      batchMock.mockResolvedValueOnce([{ results: [] }])

      const result = await new D1ContentRepository(db).findById(M2M_SEED, 'e1')
      expect(result.tags).toEqual([])
    })

    it('findMany: attaches multi-relation ids per entry', async () => {
      const rows = [
        { id: 'e1', slug: 'art-1', status: 'published', title: 'A', created_at: 0, updated_at: 0 },
        { id: 'e2', slug: 'art-2', status: 'published', title: 'B', created_at: 0, updated_at: 0 },
      ]
      const { db, batchMock } = makeMockDb()
      // First batch: main select + count; second batch: junction query
      batchMock
        .mockResolvedValueOnce([{ results: rows }, { results: [{ total: 2 }] }])
        .mockResolvedValueOnce([{
          results: [
            { parent_id: 'e1', target_id: 'tag-1' },
            { parent_id: 'e1', target_id: 'tag-2' },
            { parent_id: 'e2', target_id: 'tag-3' },
          ],
        }])

      const result = await new D1ContentRepository(db).findMany(M2M_SEED, {})
      expect(result.items[0].tags).toEqual(['tag-1', 'tag-2'])
      expect(result.items[1].tags).toEqual(['tag-3'])
    })

    it('saveDraft: multi-relation values go to junction draft table', async () => {
      const { db, prepareMock, batchMock } = makeMockDb()
      batchMock.mockResolvedValue([{ success: true }])

      await new D1ContentRepository(db).saveDraft(M2M_SEED, 'e1', { tags: ['tag-1', 'tag-2'] })

      const sqls = prepareMock.mock.calls.map((c: any[]) => c[0] as string)
      expect(sqls.some(s => s.includes('rel_articles_tags_drafts'))).toBe(true)
      expect(batchMock).toHaveBeenCalled()
    })

    it('publishDraft: throws RelationTargetNotFoundError when draft multi-rel target missing', async () => {
      const draftRow = { entry_id: 'e1', title: 'Hello' }
      const { db, firstMock, allMock, batchMock } = makeMockDb()
      firstMock
        .mockResolvedValueOnce(draftRow)  // getDraft row
        .mockResolvedValueOnce(null)       // target existence check → not found
      allMock.mockResolvedValueOnce({ results: [{ target_id: 'missing-tag' }] })
      batchMock.mockResolvedValue([{}])

      await expect(
        new D1ContentRepository(db).publishDraft(M2M_SEED, 'e1'),
      ).rejects.toBeInstanceOf(RelationTargetNotFoundError)
    })
  })
})
