// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { EntryNotFoundError, type Seed } from '@beechcms/core'
import { CANONICAL_SEEDS } from '@beechcms/testing'
import type { AppEnv } from '../../../types'
import { contentCrudApp } from '../crud.router'

const PROBLEM = 'https://beechcms.dev/problems/'

// The canonical posts seed allows drafts, which makes it kanban-incompatible; the axis is its `priority` (br_11).
const posts = { ...CANONICAL_SEEDS.find((seed) => seed.slug === 'posts')!, allowDrafts: false } as Seed

interface Problem {
  type: string
}

// The handler is mounted through the real router so the seed and body checks that precede it run too.
async function move(overrides: {
  body?: unknown
  rawBody?: string
  current?: Record<string, unknown>
  missing?: boolean
  seed?: Seed | null
} = {}) {
  const {
    body,
    rawBody,
    current = { id: 'entry-1', title: 'x', priority: ['low'], updated_at: 1 },
    missing = false,
    seed = posts,
  } = overrides

  const updateWithKanbanPosition = vi.fn().mockResolvedValue(undefined)
  const findById = missing ? vi.fn().mockRejectedValue(new EntryNotFoundError('entry-1')) : vi.fn().mockResolvedValue(current)
  const app = new Hono<AppEnv>()
  app.use('*', async (context, next) => {
    context.set('getSeed', () => seed)
    context.set('repository', { findById, updateWithKanbanPosition } as never)
    context.set('idGenerator', { uuid: () => 'gen-id' } as never)
    context.set('jwtPayload', { sub: 'user-1' } as never)
    await next()
  })
  app.route('/api/content', contentCrudApp)

  const response = await app.request('/api/content/posts/entry-1/kanban-move', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody ?? JSON.stringify(body),
  })
  return { response, updateWithKanbanPosition, findById }
}

describe('kanbanMoveHandler', () => {
  beforeEach(() => vi.clearAllMocks())

  // Regression guard: the old swap kept the previous value next to the new one on a single-choice tag → 422.
  it('replaces the single-choice value with the destination column value', async () => {
    const { response, updateWithKanbanPosition } = await move({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { value: 'high' } },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      posts, 'entry-1', { priority: ['high'] }, 'col-a', 'br_11', { actor: 'user-1', ifMatch: 1 },
    )
  })

  it('writes an empty array when the destination is the null column', async () => {
    const { response, updateWithKanbanPosition } = await move({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { value: null } },
    })

    expect(response.status).toBe(200)
    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      posts, 'entry-1', { priority: [] }, 'col-a', 'br_11', { actor: 'user-1', ifMatch: 1 },
    )
  })

  it('reorders without patching the entry when axis is omitted', async () => {
    const { response, updateWithKanbanPosition } = await move({
      body: { position: 'col-b', axisBranchId: 'br_11' },
    })

    expect(response.status).toBe(200)
    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      posts, 'entry-1', null, 'col-b', 'br_11', { actor: 'user-1', ifMatch: 1 },
    )
  })

  it('rejects the legacy axis body (kind/oldValue/newValue) with 400 content-invalid-body and writes nothing', async () => {
    const { response, updateWithKanbanPosition } = await move({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { kind: 'tags', oldValue: 'low', newValue: 'high' } },
    })

    expect(response.status).toBe(400)
    expect(((await response.json()) as Problem).type).toBe(`${PROBLEM}content-invalid-body`)
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })

  it('rejects a multiple-choice tags axis with 400 content-invalid-kanban-axis', async () => {
    const { response, updateWithKanbanPosition } = await move({
      body: { position: 'col-a', axisBranchId: 'br_07', axis: { value: 'urgent' } },
    })

    expect(response.status).toBe(400)
    expect(((await response.json()) as Problem).type).toBe(`${PROBLEM}content-invalid-kanban-axis`)
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })

  it('rejects a destination value outside the options with 422 content-validation-error and writes nothing', async () => {
    const { response, updateWithKanbanPosition } = await move({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { value: 'urgent' } },
    })

    expect(response.status).toBe(422)
    expect(((await response.json()) as Problem).type).toBe(`${PROBLEM}content-validation-error`)
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })

  // Regression guard: the partial-patch validator does not enforce required fields, so without
  // the handler check a direct call could empty a required axis through the fallback column.
  it('rejects a move to the null column of a required axis with 422 content-validation-error and writes nothing', async () => {
    const requiredPosts: Seed = {
      ...posts,
      branches: posts.branches.map((branch) => (branch.id === 'br_11' ? { ...branch, requiredOnUpdate: true } : branch)),
    }
    const { response, updateWithKanbanPosition } = await move({
      seed: requiredPosts,
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { value: null } },
    })

    expect(response.status).toBe(422)
    expect(((await response.json()) as Problem).type).toBe(`${PROBLEM}content-validation-error`)
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })

  // The seed check sits ahead of the body check in the chain, so an unknown seed never reads the body.
  it('answers 404 content-seed-not-found for an unknown seed, even with a body that is not JSON', async () => {
    const { response, findById } = await move({ seed: null, rawBody: '{not json' })

    expect(response.status).toBe(404)
    expect(((await response.json()) as Problem).type).toBe(`${PROBLEM}content-seed-not-found`)
    expect(findById).not.toHaveBeenCalled()
  })

  // The body is checked before the entry is looked up: an unknown entry with a bad body is a 400.
  it('answers 400 content-invalid-body before it looks the entry up', async () => {
    const { response, findById } = await move({ body: { position: '', axisBranchId: 'br_11' } })

    expect(response.status).toBe(400)
    expect(((await response.json()) as Problem).type).toBe(`${PROBLEM}content-invalid-body`)
    expect(findById).not.toHaveBeenCalled()
  })

  it('answers 404 content-not-found when the entry does not exist, and writes nothing', async () => {
    const { response, updateWithKanbanPosition } = await move({ missing: true, body: { position: 'col-a', axisBranchId: 'br_11' } })

    expect(response.status).toBe(404)
    expect(((await response.json()) as Problem).type).toBe(`${PROBLEM}content-not-found`)
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })
})
