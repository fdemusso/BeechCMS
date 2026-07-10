// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { Seed } from '@beechcms/core'
import { kanbanMoveHandler } from './kanban-move'

vi.mock('../../../public/problem-details', () => ({
  publicProblem: vi.fn((_ctx, details) => ({ mockProblem: true, ...details })),
}))

const SEED: Seed = {
  slug: 'articles',
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'tags', label: 'Tags', type: 'tags' },
  ],
}

function makeContext(overrides: {
  body?: unknown
  current?: Record<string, unknown>
  updateWithKanbanPosition?: () => Promise<void>
} = {}) {
  const {
    body,
    current = { id: 'entry-1', title: 'x', tags: [] },
    updateWithKanbanPosition = vi.fn().mockResolvedValue(undefined),
  } = overrides

  const jsonMock = vi.fn((data: unknown) => ({ json: data }))
  const ctx = {
    req: {
      param: vi.fn((key: string) => {
        if (key === 'slug') return 'articles'
        if (key === 'id') return 'entry-1'
        return undefined
      }),
      json: vi.fn().mockResolvedValue(body),
    },
    get: vi.fn((key: string) => {
      if (key === 'getSeed') return () => SEED
      if (key === 'repository') return { findById: vi.fn().mockResolvedValue(current), updateWithKanbanPosition }
      if (key === 'idGenerator') return () => 'gen-id'
      if (key === 'jwtPayload') return { sub: 'user-1' }
      return undefined
    }),
    json: jsonMock,
  }
  return { ctx, jsonMock, updateWithKanbanPosition }
}

describe('kanbanMoveHandler tags axis', () => {
  it('does not duplicate newValue already present in the tags array', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: {
        position: 'col-a',
        axisBranchId: 'br_02',
        axis: { kind: 'tags', oldValue: null, newValue: 'urgent' },
      },
      current: { id: 'entry-1', title: 'x', tags: ['urgent'] },
    })

    await kanbanMoveHandler(ctx as never)

    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      { tags: ['urgent'] },
      'col-a',
      'br_02',
      { actor: 'user-1' },
    )
  })

  it('swaps oldValue for newValue without duplicating', async () => {
    const { ctx, updateWithKanbanPosition } = makeContext({
      body: {
        position: 'col-b',
        axisBranchId: 'br_02',
        axis: { kind: 'tags', oldValue: 'todo', newValue: 'done' },
      },
      current: { id: 'entry-1', title: 'x', tags: ['todo', 'other'] },
    })

    await kanbanMoveHandler(ctx as never)

    expect(updateWithKanbanPosition).toHaveBeenCalledWith(
      SEED,
      'entry-1',
      { tags: ['other', 'done'] },
      'col-b',
      'br_02',
      { actor: 'user-1' },
    )
  })
})
