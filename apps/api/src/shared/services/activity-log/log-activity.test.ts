// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../../../types'
import { actorFromJwt, logActivity, requestOrigin } from './log-activity'

type Ctx = Parameters<typeof logActivity>[0]

function appWith(vars: Record<string, unknown>, handler: (c: Ctx) => void) {
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    for (const [key, value] of Object.entries(vars)) (c as unknown as { set: (k: string, v: unknown) => void }).set(key, value)
    await next()
  })
  app.get('/', (c) => {
    handler(c)
    return c.json({ ok: true })
  })
  return app
}

const claims = { sub: 'u1', email: 'ada@example.com', name: 'Ada', surname: 'Lovelace' }

describe('logActivity', () => {
  it('records the entry as the authenticated caller', async () => {
    const log = vi.fn()
    const app = appWith({ activityLogger: { log }, jwtPayload: claims }, (c) =>
      logActivity(c, { action: 'update', entityType: 'user', entityId: 'u1', details: { op: 'password' } }))
    await app.request('/')
    expect(log).toHaveBeenCalledWith({
      action: 'update', entityType: 'user', entityId: 'u1', details: { op: 'password' },
      actor: { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace' },
    })
  })

  it('uses the actor it is given when there is no session yet', async () => {
    const log = vi.fn()
    const app = appWith({ activityLogger: { log } }, (c) =>
      logActivity(c, { action: 'login', entityType: 'auth', entityId: 'u2', actor: { id: 'u2', email: 'b@example.com' } }))
    await app.request('/')
    expect(log.mock.calls[0][0].actor).toEqual({ id: 'u2', email: 'b@example.com' })
  })

  it('does nothing without a logger or a session, and never throws', async () => {
    const log = vi.fn(() => { throw new Error('sink down') })
    const noSession = appWith({ activityLogger: { log } }, (c) => logActivity(c, { action: 'update', entityType: 'user', entityId: 'x' }))
    expect((await noSession.request('/')).status).toBe(200)
    expect(log).not.toHaveBeenCalled()

    const failing = appWith({ activityLogger: { log }, jwtPayload: claims }, (c) => logActivity(c, { action: 'update', entityType: 'user', entityId: 'x' }))
    expect((await failing.request('/')).status).toBe(200)

    const noLogger = appWith({ jwtPayload: claims }, (c) => logActivity(c, { action: 'update', entityType: 'user', entityId: 'x' }))
    expect((await noLogger.request('/')).status).toBe(200)
  })
})

describe('actorFromJwt', () => {
  it('is null without claims, and has no name when the user has none', async () => {
    let seen: unknown = 'unset'
    await appWith({}, (c) => { seen = actorFromJwt(c) }).request('/')
    expect(seen).toBeNull()

    await appWith({ jwtPayload: { sub: 'u3' } }, (c) => { seen = actorFromJwt(c) }).request('/')
    expect(seen).toEqual({ id: 'u3', email: 'unknown', name: null })
  })
})

describe('requestOrigin', () => {
  const origin = async (headers: Record<string, string>) => {
    let seen: ReturnType<typeof requestOrigin> | undefined
    await appWith({}, (c) => { seen = requestOrigin(c) }).request('/', { headers })
    return seen
  }

  it('reads the IP, country and browser from the request', async () => {
    expect(await origin({ 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'IT', 'user-agent': 'Mozilla/5.0' }))
      .toEqual({ ip: '203.0.113.7', country: 'IT', userAgent: 'Mozilla/5.0' })
  })

  it('drops the unknown-country markers and falls back to "unknown" for the IP', async () => {
    expect(await origin({ 'cf-ipcountry': 'XX' })).toEqual({ ip: 'unknown' })
    expect(await origin({ 'cf-ipcountry': 'T1' })).toEqual({ ip: 'unknown' })
  })

  it('truncates a very long user agent', async () => {
    const result = await origin({ 'user-agent': 'x'.repeat(500) })
    expect(result?.userAgent).toHaveLength(200)
  })
})
