// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { EntryConflictError, PrivacyService } from '@beechcms/core'
import { rotateFieldApp } from './rotate-field.handler'
import { buildDefaultRegistry, type IRateLimiterRegistry } from '../../middleware/rate-limit.middleware'
import type { Env, Variables } from '../../types'

const privacyService = new PrivacyService('test-master-key-32-chars-minimum-1234567890')

const SEED = {
  slug: 'users',
  branches: [{ id: 'br_01', alias: 'pin', type: 'text', policies: { classification: 'restricted' } }],
}

async function buildApp(update: ReturnType<typeof vi.fn>, options: { rateLimiters?: IRateLimiterRegistry } = {}) {
  const repository = {
    findById: vi.fn(async () => ({ id: 'e1', pin: await privacyService.hash('old'), updated_at: 1234 })),
    update,
  }
  const rateLimiters = options.rateLimiters ?? buildDefaultRegistry()
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('getSeed', (() => SEED) as any)
    c.set('repository', repository as any)
    c.set('privacyService', privacyService)
    c.set('jwtPayload', { sub: 'user-1' } as any)
    c.set('rateLimiters', rateLimiters)
    await next()
  })
  app.route('/', rotateFieldApp)
  return app
}

function rotate(app: Hono<{ Bindings: Env; Variables: Variables }>, body: Record<string, string> = {}) {
  return app.request('/users/e1/rotate-field', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fieldAlias: 'pin', currentValue: 'old', nextValue: 'new', ...body }),
  })
}

const RICHTEXT_SEED = {
  slug: 'profiles',
  branches: [{ id: 'br_01', alias: 'bio', type: 'richtext', policies: { classification: 'restricted' } }],
}

async function buildRichtextApp(update: ReturnType<typeof vi.fn>) {
  const repository = {
    findById: vi.fn(async () => ({ id: 'e1', bio: await privacyService.hash('old'), updated_at: 1234 })),
    update,
  }
  const rateLimiters = buildDefaultRegistry()
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('getSeed', (() => RICHTEXT_SEED) as any)
    c.set('repository', repository as any)
    c.set('privacyService', privacyService)
    c.set('jwtPayload', { sub: 'user-1' } as any)
    c.set('rateLimiters', rateLimiters)
    await next()
  })
  app.route('/', rotateFieldApp)
  return app
}

describe('rotate-field handler', () => {
  it('guards the write with the updated_at it verified against', async () => {
    const update = vi.fn(async () => undefined)
    const res = await rotate(await buildApp(update))

    expect(res.status).toBe(200)
    expect(update.mock.calls[0]?.[4]).toEqual({ ifMatch: 1234 })
  })

  it('returns 409 when a concurrent rotation changed the row first', async () => {
    const update = vi.fn(async () => {
      throw new EntryConflictError({ seedSlug: 'users', entryId: 'e1', expectedUpdatedAt: 1234, actualUpdatedAt: 1300 })
    })
    const res = await rotate(await buildApp(update))

    expect(res.status).toBe(409)
  })

  it('hashes the sanitized next value, not the raw request value', async () => {
    const update = vi.fn(async () => undefined)
    const app = await buildApp(update)

    const rawNext = '  new\u0007value  ' // surrounding whitespace + a control char the schema strips
    const res = await rotate(app, { nextValue: rawNext })

    expect(res.status).toBe(200)
    const written = update.mock.calls[0]?.[2] as Record<string, string>
    expect(written.pin).toBe(await privacyService.hash('newvalue'))
    expect(written.pin).not.toBe(await privacyService.hash(rawNext))
  })

  it('rejects dangerous richtext content with a dedicated 422 instead of hashing it', async () => {
    const update = vi.fn(async () => undefined)
    const app = await buildRichtextApp(update)

    const res = await app.request('/profiles/e1/rotate-field', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fieldAlias: 'bio', currentValue: 'old', nextValue: '<script>alert(1)</script>' }),
    })

    expect(res.status).toBe(422)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('rotate-field-dangerous-content')
    expect(update).not.toHaveBeenCalled()
  })

  it('throttles repeated rotation attempts for the same actor, entry and field', async () => {
    const update = vi.fn(async () => undefined)
    const app = await buildApp(update)

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await rotate(app)
      expect(res.status).toBe(200)
    }

    const blocked = await rotate(app)

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).not.toBeNull()
    expect(update).toHaveBeenCalledTimes(5)
  })
})
