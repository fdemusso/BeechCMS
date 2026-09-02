// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { apiKeyMiddleware } from './api-key-middleware.js'

function buildApp(env: { PUBLIC_READ_API_KEY?: string; PUBLIC_WRITE_API_KEY?: string } = {}) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.env = { ...env }
    await next()
  })
  app.use('*', apiKeyMiddleware())
  app.all('*', (c) => c.json({ ok: true }))
  return app
}

describe('apiKeyMiddleware', () => {
  it('bypasses authentication on zero-secret paths', async () => {
    const app = buildApp()

    const resHealth = await app.request('/health')
    expect(resHealth.status).toBe(200)

    const resTimeTrap = await app.request('/timetrap/token')
    expect(resTimeTrap.status).toBe(200)

    const resSchema = await app.request('/posts/schema', { method: 'GET' })
    expect(resSchema.status).toBe(200)

    const resAdd = await app.request('/posts/add', { method: 'POST' })
    expect(resAdd.status).toBe(200)
  })

  it('returns 403 when configured key is missing in environment', async () => {
    const app = buildApp({})

    const res = await app.request('/posts', { method: 'GET' })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.type).toBe('https://beechcms.dev/problems/public-api-not-configured')
  })

  it('returns 401 when X-API-Key header is missing', async () => {
    const app = buildApp({ PUBLIC_READ_API_KEY: 'valid-read-key' })

    const res = await app.request('/posts', { method: 'GET' })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.type).toBe('https://beechcms.dev/problems/public-api-key-unauthorized')
  })

  it('returns 401 when X-API-Key is incorrect or has different length', async () => {
    const app = buildApp({ PUBLIC_READ_API_KEY: 'valid-read-key' })

    const resWrongLength = await app.request('/posts', {
      method: 'GET',
      headers: { 'X-API-Key': 'short' },
    })
    expect(resWrongLength.status).toBe(401)

    const resDifferentChar = await app.request('/posts', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-read-kex' },
    })
    expect(resDifferentChar.status).toBe(401)
  })

  it('allows request when valid read key is provided for GET', async () => {
    const app = buildApp({ PUBLIC_READ_API_KEY: 'valid-read-key' })

    const res = await app.request('/posts', {
      method: 'GET',
      headers: { 'X-API-Key': 'valid-read-key' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('validates PUBLIC_WRITE_API_KEY for write methods (POST, PUT)', async () => {
    const app = buildApp({
      PUBLIC_READ_API_KEY: 'valid-read-key',
      PUBLIC_WRITE_API_KEY: 'valid-write-key',
    })

    const resWithReadKey = await app.request('/posts/update', {
      method: 'POST',
      headers: { 'X-API-Key': 'valid-read-key' },
    })
    expect(resWithReadKey.status).toBe(401)

    const resWithWriteKey = await app.request('/posts/update', {
      method: 'POST',
      headers: { 'X-API-Key': 'valid-write-key' },
    })
    expect(resWithWriteKey.status).toBe(200)
  })
})
