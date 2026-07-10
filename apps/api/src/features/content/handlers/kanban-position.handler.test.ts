// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { EntryNotFoundError } from '@beechcms/core'
import { kanbanPositionHandler } from './kanban-position'

vi.mock('../../../public/problem-details', () => ({
  publicProblem: vi.fn((_ctx, details) => ({ mockProblem: true, ...details })),
}))

const SEED = {
  slug: 'articles',
  branches: [{ id: 'br_01', alias: 'published', label: 'Published', type: 'boolean', policies: {} }],
}

function makeContext(overrides: {
  slug?: string | null
  id?: string | null
  seed?: unknown
  body?: unknown
  findById?: () => Promise<unknown>
  setPosition?: () => Promise<void>
} = {}) {
  const {
    slug = 'articles',
    id = 'entry-1',
    seed = SEED,
    body = { position: 'col-a', axisBranchId: 'br_01' },
    findById = vi.fn().mockResolvedValue({ id: 'entry-1' }),
    setPosition = vi.fn().mockResolvedValue(undefined),
  } = overrides

  const jsonMock = vi.fn((data: unknown) => ({ json: data }))
  const ctx = {
    req: {
      param: vi.fn((key: string) => {
        if (key === 'slug') return slug
        if (key === 'id') return id
        return undefined
      }),
      json: vi.fn().mockResolvedValue(body),
    },
    get: vi.fn((key: string) => {
      if (key === 'getSeed') return () => seed
      if (key === 'repository') return { findById }
      if (key === 'kanbanPositionRepository') return { setPosition }
      return undefined
    }),
    json: jsonMock,
  }
  return { ctx, jsonMock, setPosition, findById }
}

describe('kanbanPositionHandler', () => {
  it('returns { success: true } on valid request', async () => {
    const { ctx, jsonMock } = makeContext()
    await kanbanPositionHandler(ctx as never)
    expect(jsonMock).toHaveBeenCalledWith({ success: true })
  })

  it('returns 404 when findById throws EntryNotFoundError', async () => {
    const { ctx } = makeContext({
      findById: vi.fn().mockRejectedValue(new EntryNotFoundError('not found')),
    })
    const result = await kanbanPositionHandler(ctx as never)
    expect((result as Record<string, unknown>).status).toBe(404)
  })

  it('rethrows unexpected errors from findById', async () => {
    const boom = new Error('db connection lost')
    const { ctx } = makeContext({
      body: { position: 'col-a', axisBranchId: 'br_01' },
      findById: vi.fn().mockRejectedValue(boom),
    })
    await expect(kanbanPositionHandler(ctx as never)).rejects.toThrow('db connection lost')
  })

  it('400s when slug is missing', async () => {
    const { ctx } = makeContext({ slug: null })
    const result = await kanbanPositionHandler(ctx as never)
    expect((result as Record<string, unknown>).status).toBe(400)
  })

  it('404s when seed is not found', async () => {
    const { ctx } = makeContext({ seed: null })
    const result = await kanbanPositionHandler(ctx as never)
    expect((result as Record<string, unknown>).status).toBe(404)
  })

  it('400s on invalid body', async () => {
    const { ctx } = makeContext({ body: { position: 123, axisBranchId: 'br_01' } })
    const result = await kanbanPositionHandler(ctx as never)
    expect((result as Record<string, unknown>).status).toBe(400)
  })

  it('400s when axisBranchId is not a valid kanban candidate', async () => {
    const { ctx } = makeContext({ body: { position: 'col-a', axisBranchId: 'br_NOTEXIST' } })
    const result = await kanbanPositionHandler(ctx as never)
    expect((result as Record<string, unknown>).status).toBe(400)
  })
})
