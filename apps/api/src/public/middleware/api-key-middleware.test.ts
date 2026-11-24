// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { apiKeyMiddleware } from './api-key-middleware.js'
import { DEV_PUBLISHABLE_KEY, DEV_SECRET_KEY, PUBLIC_KEY_DEV_SECRET_WARNING } from './public-key-auth.js'
import type { PublicKeyBindings } from './public-key-auth.js'

const PROBLEM_BASE = 'https://beechcms.dev/problems/'
const PUBLISHABLE_KEY = 'beech_pk_unit_valid'
const SECRET_KEY = 'beech_sk_unit_valid'

// Inline env objects keep the decision table readable: the subject here is the table, not the app.
function buildApp(env: PublicKeyBindings & Record<string, unknown> = {}) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.env = { ...env }
    await next()
  })
  app.use('*', apiKeyMiddleware())
  app.all('*', (c) => c.json({ ok: true }))
  return app
}

async function problemType(res: Response): Promise<string> {
  const body = await res.json<{ type: string }>()
  return body.type
}

describe('apiKeyMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('zero-secret paths pass with no key and nothing configured', async () => {
    const app = buildApp()

    const resHealth = await app.request('/health')
    const resTimeTrap = await app.request('/timetrap/token')
    const resSchema = await app.request('/posts/schema', { method: 'GET' })
    const resAdd = await app.request('/posts/add', { method: 'POST' })

    expect([resHealth.status, resTimeTrap.status, resSchema.status, resAdd.status]).toEqual([200, 200, 200, 200])
  })

  it('paths merely containing /add as substring are not zero-secret and get 401', async () => {
    const app = buildApp({ BEECH_SECRET_KEY: SECRET_KEY })

    const resAddBatch = await app.request('/posts/add-batch', { method: 'POST' })
    const resAddExtra = await app.request('/posts/add/extra', { method: 'POST' })

    expect(resAddBatch.status).toBe(401)
    expect(resAddExtra.status).toBe(401)
  })

  it('the publishable key passes GET and HEAD and gets 403 secret-key-required on every write, the secret key passes all six', async () => {
    const app = buildApp({ BEECH_PUBLISHABLE_KEY: PUBLISHABLE_KEY, BEECH_SECRET_KEY: SECRET_KEY })
    const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']
    const readMethods = new Set(['GET', 'HEAD'])

    for (const method of methods) {
      const withPublishable = await app.request('/posts', { method, headers: { 'X-API-Key': PUBLISHABLE_KEY } })
      const withSecret = await app.request('/posts', { method, headers: { 'X-API-Key': SECRET_KEY } })

      expect(withPublishable.status).toBe(readMethods.has(method) ? 200 : 403)
      if (!readMethods.has(method)) {
        expect(await problemType(withPublishable)).toBe(`${PROBLEM_BASE}public-api-secret-key-required`)
      }
      expect(withSecret.status).toBe(200)
    }
  })

  it('a wrong key of a different length or one differing character gets 401 key-unauthorized', async () => {
    const app = buildApp({ BEECH_PUBLISHABLE_KEY: PUBLISHABLE_KEY })

    const resWrongLength = await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': 'short' } })
    const resDifferentChar = await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': 'beech_pk_unit_valix' } })

    expect(resWrongLength.status).toBe(401)
    expect(await problemType(resWrongLength)).toBe(`${PROBLEM_BASE}public-api-key-unauthorized`)
    expect(resDifferentChar.status).toBe(401)
  })

  it('a missing key gets 401 key-unauthorized when at least one key is configured', async () => {
    const app = buildApp({ BEECH_PUBLISHABLE_KEY: PUBLISHABLE_KEY })

    const res = await app.request('/posts', { method: 'GET' })

    expect(res.status).toBe(401)
    expect(await problemType(res)).toBe(`${PROBLEM_BASE}public-api-key-unauthorized`)
  })

  it('a read with neither key configured gets 403 not-configured', async () => {
    const app = buildApp({})

    const res = await app.request('/posts', { method: 'GET' })

    expect(res.status).toBe(403)
    expect(await problemType(res)).toBe(`${PROBLEM_BASE}public-api-not-configured`)
  })

  it('a write with only the publishable key configured and no header gets 403 not-configured', async () => {
    const app = buildApp({ BEECH_PUBLISHABLE_KEY: PUBLISHABLE_KEY })

    const res = await app.request('/posts/update', { method: 'POST' })

    expect(res.status).toBe(403)
    expect(await problemType(res)).toBe(`${PROBLEM_BASE}public-api-not-configured`)
  })

  it('the secret key reads with no publishable key configured', async () => {
    const app = buildApp({ BEECH_SECRET_KEY: SECRET_KEY })

    const res = await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': SECRET_KEY } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('the dev secret key is refused with 403 dev-secret-key when ENV is production or unset', async () => {
    const environments: Array<string | undefined> = ['production', undefined]

    for (const environment of environments) {
      const app = buildApp({ BEECH_SECRET_KEY: DEV_SECRET_KEY, ENV: environment })

      const res = await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': DEV_SECRET_KEY } })

      expect(res.status).toBe(403)
      expect(await problemType(res)).toBe(`${PROBLEM_BASE}public-api-dev-secret-key`)
    }
  })

  it('the dev secret key passes when ENV is development', async () => {
    const app = buildApp({ BEECH_SECRET_KEY: DEV_SECRET_KEY, ENV: 'development' })

    const res = await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': DEV_SECRET_KEY } })

    expect(res.status).toBe(200)
  })

  it('a dev-guard refusal logs the warning line once, with no argument carrying the key value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = buildApp({ BEECH_SECRET_KEY: DEV_SECRET_KEY, ENV: 'production' })

    await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': DEV_SECRET_KEY } })

    // The log line is the operator-facing contract of the guard, not a stand-in for the 403 behaviour above.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(PUBLIC_KEY_DEV_SECRET_WARNING)
    expect(warn.mock.calls[0].join(' ')).not.toContain(DEV_SECRET_KEY)
  })

  it('the dev publishable key as the configured publishable key passes a GET with ENV production', async () => {
    const app = buildApp({ BEECH_PUBLISHABLE_KEY: DEV_PUBLISHABLE_KEY, ENV: 'production' })

    const res = await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': DEV_PUBLISHABLE_KEY } })

    expect(res.status).toBe(200)
  })

  it('legacy bindings alone leave the API unconfigured even when the old value is sent', async () => {
    const app = buildApp({ PUBLIC_READ_API_KEY: 'legacy-read-key', PUBLIC_WRITE_API_KEY: 'legacy-write-key' })

    const resRead = await app.request('/posts', { method: 'GET', headers: { 'X-API-Key': 'legacy-read-key' } })
    const resWrite = await app.request('/posts/update', { method: 'POST', headers: { 'X-API-Key': 'legacy-write-key' } })

    expect(resRead.status).toBe(403)
    expect(await problemType(resRead)).toBe(`${PROBLEM_BASE}public-api-not-configured`)
    expect(resWrite.status).toBe(403)
    expect(await problemType(resWrite)).toBe(`${PROBLEM_BASE}public-api-not-configured`)
  })
})
