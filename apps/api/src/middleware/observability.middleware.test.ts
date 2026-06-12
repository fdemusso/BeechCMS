// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { observabilityMiddleware } from './observability.middleware'
import type { IClock, IIdGenerator } from '@beechcms/core'

describe('observabilityMiddleware', () => {
  it('injects default activityLogger and background notification service when no overrides are given', async () => {
    const app = new Hono()
    
    app.use('*', async (c, next) => {
      c.set('notificationRepository' as never, {} as any)
      await next()
    })
    
    app.use('*', observabilityMiddleware())
    
    app.get('/test', (c) => {
      const logger = c.get('activityLogger' as never)
      const notifications = c.get('notificationService' as never)
      return c.json({
        hasLogger: !!logger,
        hasNotifications: !!notifications,
      })
    })

    const executionCtx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }

    // Mock env with DB
    const res = await app.request('/test', undefined, { DB: {} }, executionCtx)
    const body = await res.json() as any
    expect(body.hasLogger).toBe(true)
    expect(body.hasNotifications).toBe(true)
  })

  it('respects overrides when provided', async () => {
    const app = new Hono()
    
    const mockLogger = { log: vi.fn() }
    const mockNotifications = { send: vi.fn() }
    const mockClock: IClock = { now: () => 12345 }
    const mockIdGen: IIdGenerator = { nextId: () => 'custom-id' }

    app.use('*', observabilityMiddleware({
      activityLogger: mockLogger as any,
      notificationService: mockNotifications as any,
      clock: mockClock,
      idGenerator: mockIdGen,
    }))

    app.get('/test', (c) => {
      const logger = c.get('activityLogger' as never)
      const notifications = c.get('notificationService' as never)
      return c.json({
        loggerIsOverridden: logger === mockLogger,
        notificationsAreOverridden: notifications === mockNotifications,
      })
    })

    const res = await app.request('/test')
    const body = await res.json() as any
    expect(body.loggerIsOverridden).toBe(true)
    expect(body.notificationsAreOverridden).toBe(true)
  })

  it('uses QStashNotificationService when QSTASH_TOKEN and APP_URL are in Env', async () => {
    const app = new Hono()
    app.use('*', observabilityMiddleware())
    
    app.get('/test', (c) => {
      const notifications = c.get('notificationService' as never) as any
      return c.json({
        type: notifications?.constructor?.name,
      })
    })

    const env = {
      QSTASH_TOKEN: 'token',
      APP_URL: 'https://my-app.com',
      DB: {},
    }
    
    const res = await app.request('/test', undefined, env)
    const body = await res.json() as any
    expect(body.type).toBe('QStashNotificationService')
  })
})
