// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getViewConfigHandler, putViewConfigHandler } from './view-config'

vi.mock('../../../public/problem-details', () => ({
  publicProblem: vi.fn((_ctx, details) => ({ mockProblem: true, ...details })),
}))

function makeContext(overrides: {
  slug?: string | null
  seed?: unknown
  viewConfig?: unknown
  body?: unknown
  jwtSub?: string
} = {}) {
  const { slug = 'articles', seed = { slug: 'articles', branches: [] }, viewConfig = null, body = {}, jwtSub = 'user-1' } = overrides
  const getViewConfigMock = vi.fn().mockResolvedValue(viewConfig)
  const setViewConfigMock = vi.fn().mockResolvedValue(undefined)
  const jsonMock = vi.fn((data: unknown) => ({ json: data }))
  const ctx = {
    req: {
      param: vi.fn((key: string) => (key === 'slug' ? slug : undefined)),
      json: vi.fn().mockResolvedValue(body),
    },
    get: vi.fn((key: string) => {
      if (key === 'getSeed') return () => seed
      if (key === 'seedLayoutRepository') return { getViewConfig: getViewConfigMock, setViewConfig: setViewConfigMock }
      if (key === 'jwtPayload') return { sub: jwtSub }
      return undefined
    }),
    json: jsonMock,
  }
  return { ctx, getViewConfigMock, setViewConfigMock, jsonMock }
}

describe('getViewConfigHandler', () => {
  it('returns {} when no config is stored', async () => {
    const { ctx, jsonMock } = makeContext({ viewConfig: null })
    await getViewConfigHandler(ctx as never)
    expect(jsonMock).toHaveBeenCalledWith({})
  })

  it('returns stored config', async () => {
    const config = { kanban: { axisBranchId: 'br_01', sort: null } }
    const { ctx, jsonMock } = makeContext({ viewConfig: config })
    await getViewConfigHandler(ctx as never)
    expect(jsonMock).toHaveBeenCalledWith(config)
  })

  it('404s on unknown seed', async () => {
    const { ctx } = makeContext({ seed: null })
    const result = await getViewConfigHandler(ctx as never)
    expect((result as unknown as Record<string, unknown>).status).toBe(404)
  })
})

describe('putViewConfigHandler', () => {
  it('upserts valid config and returns { ok: true }', async () => {
    const body = { kanban: { axisBranchId: 'br_01', sort: null } }
    const { ctx, setViewConfigMock, jsonMock } = makeContext({ body })
    await putViewConfigHandler(ctx as never)
    expect(setViewConfigMock).toHaveBeenCalledWith('articles', body, 'user-1')
    expect(jsonMock).toHaveBeenCalledWith({ ok: true })
  })

  it('422s on invalid body', async () => {
    const body = { kanban: { axisBranchId: 123, sort: null } }
    const { ctx } = makeContext({ body })
    const result = await putViewConfigHandler(ctx as never)
    expect((result as unknown as Record<string, unknown>).status).toBe(422)
  })

  it('404s on unknown seed', async () => {
    const { ctx } = makeContext({ seed: null, body: { kanban: { axisBranchId: null, sort: null } } })
    const result = await putViewConfigHandler(ctx as never)
    expect((result as unknown as Record<string, unknown>).status).toBe(404)
  })

  it('200 and strips nonexistent branchId from card config', async () => {
    const body = { card: { version: 1, header: { branchId: 'br_DOESNOTEXIST' }, metadata: [] } }
    const { ctx, setViewConfigMock, jsonMock } = makeContext({ body })
    await putViewConfigHandler(ctx as never)
    expect(jsonMock).toHaveBeenCalledWith({ ok: true })
    const [, persistedConfig] = setViewConfigMock.mock.calls[0]
    expect(persistedConfig.card.header).toBeNull()
  })

  it('200 and preserves valid card config intact', async () => {
    const seed = {
      slug: 'articles',
      branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text', policies: {} }],
    }
    const body = { card: { version: 1, header: { branchId: 'br_01' }, metadata: [] } }
    const { ctx, setViewConfigMock, jsonMock } = makeContext({ seed, body })
    await putViewConfigHandler(ctx as never)
    expect(jsonMock).toHaveBeenCalledWith({ ok: true })
    const [, persistedConfig] = setViewConfigMock.mock.calls[0]
    expect(persistedConfig.card.header).toEqual({ branchId: 'br_01' })
  })
})
