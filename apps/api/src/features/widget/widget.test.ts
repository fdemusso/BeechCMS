// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { Seed, IWidgetRepository, DistributionSlice } from '@beechcms/core'
import { widgetApp } from './widget'
import type { Env, Variables } from '../../types'

const seed: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
    { id: 'br_02', alias: 'status_alias', type: 'text', label: 'Status' },
  ],
}

function makeRepoStub(distributionResult: DistributionSlice[] | Error = []): IWidgetRepository {
  return {
    aggregate: vi.fn(),
    growth: vi.fn(),
    leaderboard: vi.fn(),
    list: vi.fn(),
    timeseries: vi.fn(),
    distribution: vi.fn(async () => {
      if (distributionResult instanceof Error) throw distributionResult
      return distributionResult
    }),
  } as unknown as IWidgetRepository
}

function buildApp(opts: { repo?: IWidgetRepository; seeds?: Record<string, Seed> } = {}) {
  const repo = opts.repo ?? makeRepoStub()
  const seeds = opts.seeds ?? { posts: seed }
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('widgetRepository', repo)
    c.set('getSeed', (slug: string) => Object.hasOwn(seeds, slug) ? seeds[slug]! : null)
    await next()
  })
  app.route('/', widgetApp)
  return { app, repo }
}

describe('GET /distribution/:seed', () => {
  it('returns 200 with slices on the happy path', async () => {
    const repo = makeRepoStub([{ label: 'published', value: 5 }])
    const { app } = buildApp({ repo })
    const res = await app.request('/distribution/posts?column=status_alias')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slices: [{ label: 'published', value: 5 }] })
    expect(repo.distribution).toHaveBeenCalledWith(seed, 'status_alias', 'all', 8)
  })

  it('returns 404 for an unknown seed', async () => {
    const { app } = buildApp()
    const res = await app.request('/distribution/ghost?column=status_alias')
    expect(res.status).toBe(404)
  })

  it('returns 400 when column is missing', async () => {
    const { app } = buildApp()
    const res = await app.request('/distribution/posts')
    expect(res.status).toBe(400)
  })

  it('returns 400 problem+json for an unsafe column', async () => {
    const repo = makeRepoStub(new Error('UNSAFE_COLUMN'))
    const { app } = buildApp({ repo })
    const res = await app.request('/distribution/posts?column=evil')
    expect(res.status).toBe(400)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain('Invalid column reference')
  })

  it('bounds limit to the maximum and applies window', async () => {
    const repo = makeRepoStub([])
    const { app } = buildApp({ repo })
    await app.request('/distribution/posts?column=status_alias&window=week&limit=999')
    expect(repo.distribution).toHaveBeenCalledWith(seed, 'status_alias', 'week', 24)
  })
})

describe('GET /distribution/:seed — encrypted storage', () => {
  const encryptedSeed: Seed = {
    slug: 'tickets',
    label: 'Ticket',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      { id: 'br_02', alias: 'category', type: 'text', label: 'Category', policies: { classification: 'confidential' } },
    ],
  }

  it('rejects a visible confidential column with 400 instead of grouping ciphertext', async () => {
    const repo = makeRepoStub([{ label: 'v1:random-iv-ciphertext', value: 1 }])
    const { app } = buildApp({ repo, seeds: { tickets: encryptedSeed } })

    const res = await app.request('/distribution/tickets?column=category')

    expect(res.status).toBe(400)
    expect(repo.distribution).not.toHaveBeenCalled()
  })

  it('still groups plain and system columns of the same seed', async () => {
    const repo = makeRepoStub([{ label: 'draft', value: 2 }])
    const { app } = buildApp({ repo, seeds: { tickets: encryptedSeed } })

    const responses = [
      await app.request('/distribution/tickets?column=title'),
      await app.request('/distribution/tickets?column=status'),
    ]

    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect(repo.distribution).toHaveBeenCalledTimes(2)
  })
})

describe('GET /growth/:seed', () => {
  it('returns 200 and handles a decline from a zero baseline', async () => {
    const repo = makeRepoStub()
    repo.growth = vi.fn().mockResolvedValue({ currentValue: -5, previousValue: 0 })
    const { app } = buildApp({ repo })
    const res = await app.request('/growth/posts?formula={"op":"sum","column":"title"}')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      current: -5,
      previous: 0,
      percentageChange: -100,
      trend: 'down',
    })
  })

  it('returns 400 when formula op is unrecognized', async () => {
    const { app } = buildApp()
    const res = await app.request('/growth/posts?formula={"op":"evil"}')
    expect(res.status).toBe(400)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain('Invalid or missing formula')
  })
})

describe('Security / Prototype Pollution', () => {
  it('rejects builtin prototype keys for seed slug', async () => {
    const { app } = buildApp()
    const res = await app.request('/distribution/constructor?column=status_alias')
    expect(res.status).toBe(404)
  })

  it('rejects builtin prototype keys for formula op', async () => {
    const { app } = buildApp()
    const res = await app.request('/aggregate/posts?formula={"constructor":"sum"}')
    expect(res.status).toBe(400)
  })
})

describe('GET /list/:seed', () => {
  it('returns 400 for filters JSON not being an array (e.g., prototype pollution attempt via object)', async () => {
    const { app } = buildApp()
    const res = await app.request('/list/posts?filters=%7B%22constructor%22%3A%7B%7D%7D')
    expect(res.status).toBe(400)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain('must be an array')
  })

  it('handles safe lookup in deserialization of branches', async () => {
    const repo = makeRepoStub()
    repo.list = vi.fn().mockResolvedValue({
      entries: [
        { id: '1', slug: 'a', status: 'draft', created_at: 0, updated_at: 0, title: 'Test' }
      ],
      totalCount: 1
    })
    const { app } = buildApp({ repo })
    const res = await app.request('/list/posts')
    expect(res.status).toBe(200)
    const body = await res.json() as { entries: Array<Record<string, unknown>> }
    expect(body.entries[0]).toHaveProperty('title', 'Test')
  })
})

describe('GET /aggregate/:seed', () => {
  it('returns 400 when formula op is unrecognized', async () => {
    const { app } = buildApp()
    const res = await app.request('/aggregate/posts?formula={"op":"evil"}')
    expect(res.status).toBe(400)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain('Invalid or missing formula')
  })

  it('handles countWhere formula correctly', async () => {
    const repo = makeRepoStub()
    repo.aggregate = vi.fn().mockResolvedValue(12)
    const { app } = buildApp({ repo })
    const formulaJson = JSON.stringify({ op: 'countWhere', column: 'title', value: 'hello' })
    const res = await app.request(`/aggregate/posts?formula=${encodeURIComponent(formulaJson)}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ value: 12, window: 'all' })
    expect(repo.aggregate).toHaveBeenCalledWith(seed, { op: 'countWhere', column: 'title', value: 'hello' }, 'all')
  })

  it('returns 400 problem+json when countWhere column is an unsafe or builtin prototype key', async () => {
    const repo = makeRepoStub()
    repo.aggregate = vi.fn().mockRejectedValue(new Error('UNSAFE_COLUMN'))
    const { app } = buildApp({ repo })
    const formulaJson = JSON.stringify({ op: 'countWhere', column: 'constructor', value: 'hello' })
    const res = await app.request(`/aggregate/posts?formula=${encodeURIComponent(formulaJson)}`)
    expect(res.status).toBe(400)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain('Invalid column reference')
  })
})

describe('GET /timeseries/:seed', () => {
  it('returns 400 when formula op is not count, sum, or avg', async () => {
    const { app } = buildApp()
    const res = await app.request('/timeseries/posts?formula=evil&valueColumn=id')
    expect(res.status).toBe(400)
    const body = await res.json() as { detail: string }
    expect(body.detail).toContain('formula must be sum, avg, or count')
  })
})


describe('widget field visibility', () => {
  const concealedSeed: Seed = {
    slug: 'accounts',
    label: 'Account',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      { id: 'br_02', alias: 'secret', type: 'text', label: 'Secret', policies: { classification: 'confidential', visibility: 'hidden' } },
      { id: 'br_03', alias: 'note', type: 'text', label: 'Note', policies: { visibility: 'masked' } },
      { id: 'br_04', alias: 'token', type: 'text', label: 'Token', policies: { classification: 'restricted' } },
      { id: 'br_05', alias: 'views', type: 'number', label: 'Views' },
    ],
  }

  const hiddenDisplaySeed: Seed = { ...concealedSeed, slug: 'people', displayNameAlias: 'secret' }
  const seeds = { accounts: concealedSeed, people: hiddenDisplaySeed }

  const concealedColumns = ['secret', 'note', 'token']

  it('list omits hidden and restricted fields and masks masked fields', async () => {
    const repo = makeRepoStub()
    repo.list = vi.fn().mockResolvedValue({
      entries: [{
        id: '1', slug: 'a', status: 'draft', created_at: 1, updated_at: 2,
        title: 'Visible', secret: 'private@example.com', note: 'internal memo', token: 'stored-hmac', views: 3,
      }],
      totalCount: 1,
    })
    const { app } = buildApp({ repo, seeds })

    const res = await app.request('/list/accounts')

    expect(res.status).toBe(200)
    const body = await res.json() as { entries: Array<Record<string, unknown>> }
    expect(body.entries[0]).toMatchObject({ id: '1', title: 'Visible', note: '••••••••', views: 3 })
    expect(body.entries[0]).not.toHaveProperty('secret')
    expect(body.entries[0]).not.toHaveProperty('token')
  })

  it('leaderboard replaces a hidden display label with the entry id', async () => {
    const repo = makeRepoStub()
    repo.leaderboard = vi.fn().mockResolvedValue([{ id: 'e1', label: 'private@example.com', score: 9 }])
    const { app } = buildApp({ repo, seeds })

    const res = await app.request('/leaderboard/people?scoreColumn=created_at')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 'e1', label: 'e1', score: 9 }])
  })

  it.each(concealedColumns)('aggregate rejects concealed column %s with 400', async (column) => {
    const repo = makeRepoStub()
    const { app } = buildApp({ repo, seeds })
    const formula = encodeURIComponent(JSON.stringify({ op: 'countWhere', column, value: 'x' }))

    const res = await app.request(`/aggregate/accounts?formula=${formula}`)

    expect(res.status).toBe(400)
    expect(repo.aggregate).not.toHaveBeenCalled()
  })

  it.each(concealedColumns)('distribution, leaderboard and timeseries reject concealed column %s with 400', async (column) => {
    const repo = makeRepoStub()
    const { app } = buildApp({ repo, seeds })

    const responses = [
      await app.request(`/distribution/accounts?column=${column}`),
      await app.request(`/leaderboard/accounts?scoreColumn=${column}`),
      await app.request(`/timeseries/accounts?groupColumn=${column}`),
      await app.request(`/timeseries/accounts?formula=sum&valueColumn=${column}`),
    ]

    expect(responses.map(r => r.status)).toEqual([400, 400, 400, 400])
    expect(repo.distribution).not.toHaveBeenCalled()
    expect(repo.leaderboard).not.toHaveBeenCalled()
    expect(repo.timeseries).not.toHaveBeenCalled()
  })

  it.each(concealedColumns)('growth rejects concealed formula column %s with 400', async (column) => {
    const repo = makeRepoStub()
    const { app } = buildApp({ repo, seeds })
    const formula = encodeURIComponent(JSON.stringify({ op: 'sum', column }))

    const res = await app.request(`/growth/accounts?formula=${formula}`)

    expect(res.status).toBe(400)
    expect(repo.growth).not.toHaveBeenCalled()
  })

  it.each(concealedColumns)('list rejects filter and orderBy on concealed column %s with 400', async (column) => {
    const repo = makeRepoStub()
    const { app } = buildApp({ repo, seeds })
    const filters = encodeURIComponent(JSON.stringify([{ column, op: 'like', value: 'p%' }]))

    const responses = [
      await app.request(`/list/accounts?filters=${filters}`),
      await app.request(`/list/accounts?orderBy=${column}`),
    ]

    expect(responses.map(r => r.status)).toEqual([400, 400])
    expect(repo.list).not.toHaveBeenCalled()
  })

  it('list rejects search when the display column is concealed', async () => {
    const repo = makeRepoStub()
    const { app } = buildApp({ repo, seeds })

    const res = await app.request('/list/people?search=priv')

    expect(res.status).toBe(400)
    expect(repo.list).not.toHaveBeenCalled()
  })
})
