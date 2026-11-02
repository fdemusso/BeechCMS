// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../../../types'
import { contentCrudApp } from '../crud.router'

// The visibility policy is not under test here: the envelope keeps the flat row readable as `data`.
vi.mock('../../../shared/policies/apply-policies', () => ({
  toEntryEnvelope: vi.fn((item: Record<string, unknown>) => ({ ...item, data: item })),
  applyVisibility: vi.fn((item: Record<string, unknown>) => item),
}))

const SEED = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'author', label: 'Author', type: 'relation', targetSeed: 'authors' },
  ],
}

const AUTHOR_SEED_DEF = {
  slug: 'authors',
  label: 'Authors',
  displayNameAlias: 'name',
  branches: [{ id: 'br_a1', alias: 'name', label: 'Name', type: 'text' }],
}

// The handler is mounted through the real router so the seed and query checks that precede it run too.
async function list(query: string) {
  const listItems = [{ id: 'entry-1', title: 'Post', author: 'author-1' }]
  const targetItems = [{ id: 'author-1', name: 'Jane Doe' }]

  const findMany = vi.fn()
    .mockResolvedValueOnce({ items: listItems, total: 1 })
    .mockResolvedValueOnce({ items: targetItems, total: 1 })

  const app = new Hono<AppEnv>()
  app.use('*', async (context, next) => {
    context.set('getSeed', () => SEED as never)
    context.set('repository', { findMany, hasDraft: vi.fn().mockResolvedValue(false) } as never)
    context.set('seedRegistry', { get: (s: string) => (s === 'authors' ? AUTHOR_SEED_DEF : undefined) } as never)
    context.set('jwtPayload', { sub: 'user-1' } as never)
    await next()
  })
  app.route('/api/content', contentCrudApp)

  const response = await app.request(`/api/content/articles${query}`)
  return { response, findMany }
}

describe('listHandler relations map', () => {
  it('resolves relation labels from flat rows instead of item.data', async () => {
    const { response } = await list('?page=1')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ relations: { author: { 'author-1': 'Jane Doe' } } })
  })

  // Legacy contract: a bare request answers the array, any query parameter answers the envelope.
  it('answers a bare array when the request carries no query parameter', async () => {
    const { response } = await list('')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 'entry-1', title: 'Post', author: 'author-1', data: expect.any(Object), has_pending_draft: false }])
  })
})
