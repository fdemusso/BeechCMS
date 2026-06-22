// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { queueMiddleware } from './queue.middleware'
import type { IQueueService } from '@beechcms/core'

function makeApp(opts: {
  jobs?: Record<string, any>
  overrides?: { queue?: IQueueService }
} = {}) {
  const app = new Hono()

  app.use('*', async (c, next) => {
    c.set('repository' as never, {} as any)
    c.set('bucket' as never, {} as any)
    await next()
  })

  app.use('*', queueMiddleware(opts.jobs ?? {}, opts.overrides))

  app.get('/test', (c) => {
    const queue = c.get('queue' as never) as any
    return c.json({ type: queue?.constructor?.name })
  })

  return app
}

const executionCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
}

describe('queueMiddleware', () => {
  it('injects the override queue directly when provided', async () => {
    const mockQueue: IQueueService = { enqueue: vi.fn() }
    const app = new Hono()
    app.use('*', queueMiddleware({}, { queue: mockQueue }))
    app.get('/test', (c) => {
      const queue = c.get('queue' as never)
      return c.json({ isOverride: queue === mockQueue })
    })
    const res = await app.request('/test')
    const body = (await res.json()) as any
    expect(body.isOverride).toBe(true)
  })

  it('creates CloudflareQueueService when QUEUE binding is present', async () => {
    const app = makeApp()
    const env = { QUEUE: { send: vi.fn().mockResolvedValue(undefined) } }
    const res = await app.request('/test', undefined, env, executionCtx)
    const body = (await res.json()) as any
    expect(body.type).toBe('CloudflareQueueService')
  })

  it('falls back to InMemoryQueueService when QUEUE binding is absent', async () => {
    const app = makeApp()
    const res = await app.request('/test', undefined, {}, executionCtx)
    const body = (await res.json()) as any
    expect(body.type).toBe('InMemoryQueueService')
  })

  it('handles missing executionCtx gracefully and still creates InMemoryQueueService', async () => {
    const app = makeApp()
    // No executionCtx: the try block inside the middleware will throw and
    // scheduleBackgroundTask stays undefined — InMemoryQueueService runs inline.
    const res = await app.request('/test', undefined, {})
    const body = (await res.json()) as any
    expect(body.type).toBe('InMemoryQueueService')
    expect(res.status).toBe(200)
  })
})
