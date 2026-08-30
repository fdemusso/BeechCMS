// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { semanticSearchHooks } from './semantic-search.hooks'
import type { Seed, HookContext, IQueueService } from '@beechcms/core'

const SEARCHABLE_SEED: Seed = {
  id: 'seed_posts',
  slug: 'posts',
  label: 'Posts',
  labelPlural: 'Posts',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', policies: { public: true, search: true } },
    { id: 'br_02', alias: 'body', type: 'richtext', policies: { public: true, search: true } },
  ],
}

const NON_SEARCHABLE_SEED: Seed = {
  id: 'seed_logs',
  slug: 'logs',
  label: 'Logs',
  labelPlural: 'Logs',
  allowDrafts: false,
  branches: [
    { id: 'br_01', alias: 'count', type: 'number' },
  ],
}

function makeMockCtx(seed: Seed) {
  const enqueueMock = vi.fn().mockResolvedValue(true)
  const queueMock: IQueueService = { enqueue: enqueueMock }
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  const bindMock = vi.fn().mockReturnValue({ run: runMock })
  const prepareMock = vi.fn().mockReturnValue({ bind: bindMock })
  const dbMock = { prepare: prepareMock } as unknown as D1Database

  const ctx: HookContext = {
    seed,
    repository: {} as any,
    db: dbMock,
    queue: queueMock,
  }

  return { ctx, enqueueMock, prepareMock, bindMock, runMock }
}

describe('semanticSearchHooks', () => {
  it('afterCreate enqueues compute_vector only on published status for searchable seed', async () => {
    const { ctx, enqueueMock } = makeMockCtx(SEARCHABLE_SEED)

    // Draft entry -> do not enqueue
    await semanticSearchHooks.afterCreate?.({ id: 'e1', status: 'draft', title: 'Hello' }, ctx)
    expect(enqueueMock).not.toHaveBeenCalled()

    // Published entry -> enqueue compute_vector
    await semanticSearchHooks.afterCreate?.({ id: 'e2', status: 'published', title: 'Hello World' }, ctx)
    expect(enqueueMock).toHaveBeenCalledWith('compute_vector', {
      seedSlug: 'posts',
      entryId: 'e2',
    })
  })

  it('afterCreate ignores seeds without indexable branches', async () => {
    const { ctx, enqueueMock } = makeMockCtx(NON_SEARCHABLE_SEED)

    await semanticSearchHooks.afterCreate?.({ id: 'e1', status: 'published', count: 10 }, ctx)
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('afterUpdate enqueues compute_vector on published status', async () => {
    const { ctx, enqueueMock } = makeMockCtx(SEARCHABLE_SEED)

    await semanticSearchHooks.afterUpdate?.({ id: 'e1', status: 'published', title: 'Updated title' }, ctx)
    expect(enqueueMock).toHaveBeenCalledWith('compute_vector', {
      seedSlug: 'posts',
      entryId: 'e1',
    })
  })

  it('afterUpdate enqueues delete_vector on unpublish (e.g. draft/archived)', async () => {
    const { ctx, enqueueMock } = makeMockCtx(SEARCHABLE_SEED)

    await semanticSearchHooks.afterUpdate?.({ id: 'e1', status: 'draft' }, ctx)

    expect(enqueueMock).toHaveBeenCalledWith('delete_vector', {
      seedSlug: 'posts',
      entryId: 'e1',
    })
  })

  it('afterUpdate enqueues compute_vector when indexable branch changes with undefined status', async () => {
    const { ctx, enqueueMock } = makeMockCtx(SEARCHABLE_SEED)

    await semanticSearchHooks.afterUpdate?.({ id: 'e1', title: 'New Title Without Status' }, ctx)
    expect(enqueueMock).toHaveBeenCalledWith('compute_vector', {
      seedSlug: 'posts',
      entryId: 'e1',
    })
  })

  it('afterDelete enqueues delete_vector without synchronous D1 calls', async () => {
    const { ctx, enqueueMock } = makeMockCtx(SEARCHABLE_SEED)

    await semanticSearchHooks.afterDelete?.('e1', ctx)

    expect(enqueueMock).toHaveBeenCalledWith('delete_vector', {
      seedSlug: 'posts',
      entryId: 'e1',
    })
  })
})
