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

describe('GET /growth/:seed', () => {
  it('returns 200 and handles a decline from a zero baseline', async () => {
    const repo = makeRepoStub()
    repo.growth = vi.fn().mockResolvedValue({ currentValue: -5, previousValue: 0 })
    const { app } = buildApp({ repo })
    const res = await app.request('/growth/posts?formula={"op":"sum"}')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      current: -5,
      previous: 0,
      percentageChange: -100,
      trend: 'down',
    })
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
