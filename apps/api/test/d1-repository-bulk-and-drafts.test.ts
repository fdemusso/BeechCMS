// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1ContentRepository } from '../src/shared/db/repositories/content.repository.d1'
import { RelationTargetNotFoundError, RepositoryError } from '@beechcms/core'
import type { Seed } from '@beechcms/core'

const ARTICLE_SEED = {
  slug: 'articles',
  displayNameAlias: 'title',
  label: 'Article',
  labelPlural: 'Articles',
  allowDrafts: true,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text' },
    { id: 'br_02', alias: 'tags', type: 'tags' },
    { id: 'br_03', alias: 'category', type: 'relation', targetSeed: 'categories' },
    { id: 'br_04', alias: 'related_tags', type: 'relation', multiple: true, targetSeed: 'tags_seed' },
    { id: 'br_05', alias: 'view_count', type: 'number' },
  ],
} as unknown as Seed

const NO_DRAFTS_SEED = {
  slug: 'pages',
  displayNameAlias: 'title',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text' },
  ],
} as unknown as Seed

/** Mock D1 database with sequential, queueable first/all/run/batch responses. */
function makeMockDb() {
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  const firstMock = vi.fn().mockResolvedValue(null)
  const allMock = vi.fn().mockResolvedValue({ results: [] })
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  const batchMock = vi.fn().mockResolvedValue([])
  return { db: { prepare: prepareMock, batch: batchMock } as any, prepareMock, bindMock, runMock, firstMock, allMock, batchMock }
}

describe('D1ContentRepository — facets, slugs, drafts, relations', () => {
  it('getFacets returns status counts and distinct tag values', async () => {
    const { db, allMock } = makeMockDb()
    allMock
      .mockResolvedValueOnce({ results: [{ status: 'published', count: 3 }, { status: 'draft', count: 1 }] })
      .mockResolvedValueOnce({ results: [{ value: 'news' }, { value: 'tech' }] })

    const repo = new D1ContentRepository(db)
    const facets = await repo.getFacets(ARTICLE_SEED)

    expect(facets.statuses).toEqual({ published: 3, draft: 1 })
    expect(facets.tagsByColumn.tags).toEqual(['news', 'tech'])
  })

  it('existsSlug excludes a given id when checking for conflicts', async () => {
    const { db, firstMock, prepareMock } = makeMockDb()
    firstMock.mockResolvedValueOnce({ 1: 1 })

    const repo = new D1ContentRepository(db)
    const exists = await repo.existsSlug(ARTICLE_SEED, 'my-slug', 'entry-1')

    expect(exists).toBe(true)
    const sql = prepareMock.mock.calls[0][0] as string
    expect(sql).toContain('AND id != ?')
  })

  it('getDraft attaches multi-relation arrays from junction draft tables', async () => {
    const { db, firstMock, batchMock } = makeMockDb()
    firstMock.mockResolvedValueOnce({ title: 'Draft title', tags: null, category: null, related_tags: null })
    batchMock.mockResolvedValueOnce([{ results: [{ target_id: 't1' }, { target_id: 't2' }] }])

    const repo = new D1ContentRepository(db)
    const draft = await repo.getDraft(ARTICLE_SEED, 'entry-1')

    expect(draft?.title).toBe('Draft title')
    expect(draft?.related_tags).toEqual(['t1', 't2'])
  })

  it('getDraft returns null for seeds without drafts or no draft row', async () => {
    const repo1 = new D1ContentRepository(makeMockDb().db)
    expect(await repo1.getDraft(NO_DRAFTS_SEED, 'entry-1')).toBeNull()

    const { db } = makeMockDb()
    const repo2 = new D1ContentRepository(db)
    expect(await repo2.getDraft(ARTICLE_SEED, 'entry-1')).toBeNull()
  })

  it('hasDraft reports presence/absence of a draft row', async () => {
    const { db, firstMock } = makeMockDb()
    firstMock.mockResolvedValueOnce({ 1: 1 })
    const repo = new D1ContentRepository(db)
    expect(await repo.hasDraft(ARTICLE_SEED, 'entry-1')).toBe(true)

    const repo2 = new D1ContentRepository(makeMockDb().db)
    expect(await repo2.hasDraft(NO_DRAFTS_SEED, 'entry-1')).toBe(false)
  })

  it('saveDraft persists multi-relation values via junction draft table inserts', async () => {
    const { db, batchMock } = makeMockDb()
    const repo = new D1ContentRepository(db)

    await repo.saveDraft(ARTICLE_SEED, 'entry-1', { title: 'Draft', related_tags: ['t1', 't2'] })

    expect(batchMock).toHaveBeenCalled()
    const stmts = batchMock.mock.calls[0][0]
    expect(stmts.length).toBeGreaterThan(1)
  })

  it('publishDraft throws RelationTargetNotFoundError when a single relation target is missing', async () => {
    const { db, firstMock } = makeMockDb()
    firstMock
      .mockResolvedValueOnce({ title: 'New Title', category: 'missing-cat', related_tags: null })
      .mockResolvedValueOnce(null) // category target lookup fails

    const repo = new D1ContentRepository(db)
    await expect(repo.publishDraft(ARTICLE_SEED, 'entry-1')).rejects.toBeInstanceOf(RelationTargetNotFoundError)
  })

  it('publishDraft throws RelationTargetNotFoundError when a multi-relation target is missing', async () => {
    const { db, firstMock, allMock } = makeMockDb()
    firstMock
      .mockResolvedValueOnce({ title: 'New Title', category: null, related_tags: null }) // draft row
      .mockResolvedValueOnce(null) // target 'tagA' lookup fails
    allMock.mockResolvedValueOnce({ results: [{ target_id: 'tagA' }] })

    const repo = new D1ContentRepository(db)
    await expect(repo.publishDraft(ARTICLE_SEED, 'entry-1')).rejects.toBeInstanceOf(RelationTargetNotFoundError)
  })

  it('publishDraft promotes draft fields and multi-relation junctions to live tables', async () => {
    const { db, firstMock, allMock, batchMock } = makeMockDb()
    firstMock
      .mockResolvedValueOnce({ title: 'New Title', category: null, related_tags: null }) // draft row
      .mockResolvedValueOnce({ 1: 1 }) // tagA exists
      .mockResolvedValueOnce({ 1: 1 }) // tagB exists
    allMock.mockResolvedValueOnce({ results: [{ target_id: 'tagA' }, { target_id: 'tagB' }] })

    const repo = new D1ContentRepository(db)
    await repo.publishDraft(ARTICLE_SEED, 'entry-1')

    expect(batchMock).toHaveBeenCalled()
  })

  it('publishDraft is a no-op when the seed does not allow drafts', async () => {
    const { db, firstMock } = makeMockDb()
    const repo = new D1ContentRepository(db)
    await repo.publishDraft(NO_DRAFTS_SEED, 'entry-1')
    expect(firstMock).not.toHaveBeenCalled()
  })
})

describe('D1ContentRepository — runBatch', () => {
  it('resolves immediately for an empty operation list', async () => {
    const { db, batchMock, prepareMock } = makeMockDb()
    const repo = new D1ContentRepository(db)
    await repo.runBatch([])
    expect(batchMock).not.toHaveBeenCalled()
    expect(prepareMock).not.toHaveBeenCalled()
  })

  it('builds a single statement and uses run() when there is only one op', async () => {
    const { db, runMock, batchMock } = makeMockDb()
    const repo = new D1ContentRepository(db)
    await repo.runBatch([
      { kind: 'mutateField', seed: ARTICLE_SEED, id: 'e1', fieldName: 'view_count', operation: { type: 'increment', value: 1 } },
    ])
    expect(runMock).toHaveBeenCalled()
    expect(batchMock).not.toHaveBeenCalled()
  })

  it('batches create (with multi-relation junctions), update (with junction updates) and mutateField ops', async () => {
    const { db, batchMock } = makeMockDb()
    batchMock.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }])

    const repo = new D1ContentRepository(db)
    await repo.runBatch([
      { kind: 'create', seed: ARTICLE_SEED, id: 'e1', slug: 'e1', status: 'draft', data: { title: 'A', related_tags: ['t1'] } },
      { kind: 'update', seed: ARTICLE_SEED, id: 'e2', data: { title: 'B', related_tags: ['t2'] } },
      {
        kind: 'mutateField',
        seed: ARTICLE_SEED,
        id: 'e3',
        fieldName: 'view_count',
        operation: { type: 'increment', value: 2 },
        options: { min: 0, max: 100 },
      },
    ])

    expect(batchMock).toHaveBeenCalled()
  })

  it('rejects mutateField ops targeting a non-numeric field with a RepositoryError', async () => {
    const { db } = makeMockDb()
    const repo = new D1ContentRepository(db)
    await expect(repo.runBatch([
      { kind: 'mutateField', seed: ARTICLE_SEED, id: 'e1', fieldName: 'title', operation: { type: 'increment', value: 1 } },
    ])).rejects.toBeInstanceOf(RepositoryError)
  })

  it('wraps generic database errors via mapError', async () => {
    const { db, runMock } = makeMockDb()
    runMock.mockRejectedValueOnce(new Error('db exploded'))
    const repo = new D1ContentRepository(db)
    await expect(repo.runBatch([
      { kind: 'mutateField', seed: ARTICLE_SEED, id: 'e1', fieldName: 'view_count', operation: { type: 'increment', value: 1 } },
    ])).rejects.toBeInstanceOf(RepositoryError)
  })
})

describe('D1ContentRepository — bulkUpdate', () => {
  const FIELDS = {
    title: { kind: 'set', value: 'New title' },
    rel_replace: { kind: 'array_replace', value: ['x'] },
    rel_add: { kind: 'array_add', value: ['y'] },
    rel_remove: { kind: 'array_remove', value: ['z'] },
  } as const

  it('reports per-id outcomes: success, not-found, FK conflict and generic error', async () => {
    const { db, batchMock } = makeMockDb()
    batchMock
      .mockResolvedValueOnce([{ meta: { changes: 1 } }]) // ok-id: updated
      .mockResolvedValueOnce([{ meta: { changes: 0 } }]) // missing-id: not found
      .mockResolvedValueOnce(Promise.reject(new Error('FOREIGN KEY constraint failed'))) // fk-id
      .mockResolvedValueOnce(Promise.reject(new Error('boom'))) // err-id

    const repo = new D1ContentRepository(db)
    const result = await repo.bulkUpdate('articles', ['ok-id', 'missing-id', 'fk-id', 'err-id'], FIELDS as any)

    expect(result.updated).toBe(1)
    expect(result.failed).toEqual([
      { id: 'missing-id', reason: 'not-found' },
      { id: 'fk-id', reason: 'relation-target-not-found:fk-id' },
      { id: 'err-id', reason: 'error:boom' },
    ])
  })

  it('returns immediately with zero updates for an empty id list', async () => {
    const { db, batchMock } = makeMockDb()
    const repo = new D1ContentRepository(db)
    const result = await repo.bulkUpdate('articles', [], FIELDS as any)
    expect(result).toEqual({ updated: 0, failed: [] })
    expect(batchMock).not.toHaveBeenCalled()
  })
})

describe('D1ContentRepository — findPendingDrafts', () => {
  it('returns an empty array when no seeds are provided', async () => {
    const { db, prepareMock } = makeMockDb()
    const repo = new D1ContentRepository(db)
    expect(await repo.findPendingDrafts([])).toEqual([])
    expect(prepareMock).not.toHaveBeenCalled()
  })

  it('maps joined rows into draft summaries, falling back to id for empty titles', async () => {
    const { db, allMock } = makeMockDb()
    const stmt = { bind: vi.fn(() => ({ all: allMock })) }
    ;(db as any).prepare = vi.fn(() => stmt)
    allMock.mockResolvedValueOnce({
      results: [
        { seedSlug: 'articles', seedLabel: 'Articles', id: '1', updatedAt: 1000, title: 'My Title', lastName: 'Bob', lastEmail: 'bob@x.com' },
        { seedSlug: 'articles', seedLabel: 'Articles', id: '2', updatedAt: 2000, title: null, lastName: null, lastEmail: null },
      ],
    })

    const repo = new D1ContentRepository(db)
    const drafts = await repo.findPendingDrafts([ARTICLE_SEED])

    expect(drafts).toEqual([
      { id: '1', seedSlug: 'articles', seedLabel: 'Articles', title: 'My Title', updatedAt: 1000, lastModifiedBy: { name: 'Bob', email: 'bob@x.com' } },
      { id: '2', seedSlug: 'articles', seedLabel: 'Articles', title: '2', updatedAt: 2000, lastModifiedBy: { name: null, email: '' } },
    ])
  })
})
