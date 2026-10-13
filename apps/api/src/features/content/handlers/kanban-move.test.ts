// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { Seed } from '@beechcms/core'
import { CANONICAL_SEEDS } from '@beechcms/testing'
import { kanbanMoveHandler } from './kanban-move'

vi.mock('../../../public/errors/problem-details', () => ({
  publicProblem: vi.fn((_ctx, details) => ({ mockProblem: true, ...details })),
}))

// The canonical posts seed allows drafts, which makes it kanban-incompatible; the axis is its `priority` (br_11).
const posts = { ...CANONICAL_SEEDS.find((seed) => seed.slug === 'posts')!, allowDrafts: false } as Seed

function makeContext(overrides: {
  body?: unknown
  current?: Record<string, unknown>
} = {}) {
  const {
    body,
    current = { id: 'entry-1', title: 'x', priority: ['low'], updated_at: 1 },
  } = overrides

  const updateWithKanbanPosition = vi.fn().mockResolvedValue(undefined)
  const ctx = {
    req: {
      param: vi.fn((key: string) => {
        if (key === 'slug') return 'posts'
        if (key === 'id') return 'entry-1'
        return undefined
      }),
      json: vi.fn().mockResolvedValue(body),
    },
    get: vi.fn((key: string) => {
      if (key === 'getSeed') return () => posts
      if (key === 'repository') return { findById: vi.fn().mockResolvedValue(current), updateWithKanbanPosition }
      if (key === 'idGenerator') return () => 'gen-id'
      if (key === 'jwtPayload') return { sub: 'user-1' }
      return undefined
    }),
    json: vi.fn((data: unknown) => ({ json: data })),
  }
  return { ctx, updateWithKanbanPosition }
}

describe('kanbanMoveHandler', () => {
  beforeEach(() => vi.clearAllMocks())

  // Regression guard: the old swap kept the previous value next to the new one on a single-choice tag → 422.
  it('replaces the single-choice value with the destination column value', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { value: 'high' } },
    })

    const result = await kanbanMoveHandler(ctx as never)

    expect(result).toEqual({ json: { success: true } })
    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      posts, 'entry-1', { priority: ['high'] }, 'col-a', 'br_11', { actor: 'user-1', ifMatch: 1 },
    )
  })

  it('writes an empty array when the destination is the null column', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { value: null } },
    })

    const result = await kanbanMoveHandler(ctx as never)

    expect(result).toEqual({ json: { success: true } })
    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      posts, 'entry-1', { priority: [] }, 'col-a', 'br_11', { actor: 'user-1', ifMatch: 1 },
    )
  })

  it('reorders without patching the entry when axis is omitted', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: { position: 'col-b', axisBranchId: 'br_11' },
    })

    const result = await kanbanMoveHandler(ctx as never)

    expect(result).toEqual({ json: { success: true } })
    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      posts, 'entry-1', null, 'col-b', 'br_11', { actor: 'user-1', ifMatch: 1 },
    )
  })

  it('rejects the legacy axis body (kind/oldValue/newValue) with 400 content-invalid-body and writes nothing', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { kind: 'tags', oldValue: 'low', newValue: 'high' } },
    })

    const result = await kanbanMoveHandler(ctx as never)

    expect(result).toMatchObject({ status: 400, type: 'content-invalid-body' })
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })

  it('rejects a multiple-choice tags axis with 400 content-invalid-kanban-axis', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: { position: 'col-a', axisBranchId: 'br_07', axis: { value: 'urgent' } },
    })

    const result = await kanbanMoveHandler(ctx as never)

    expect(result).toMatchObject({ status: 400, type: 'content-invalid-kanban-axis' })
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })

  it('rejects a destination value outside the options with 422 content-validation-error and writes nothing', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: { position: 'col-a', axisBranchId: 'br_11', axis: { value: 'urgent' } },
    })

    const result = await kanbanMoveHandler(ctx as never)

    expect(result).toMatchObject({ status: 422, type: 'content-validation-error' })
    expect(updateWithKanbanPosition).not.toHaveBeenCalled()
  })
})
