// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { EntryConflictError, PrivacyService } from '@beechcms/core'
import { rotateFieldApp } from './rotate-field.handler'
import type { Env, Variables } from '../../types'

const privacyService = new PrivacyService('test-master-key-32-chars-minimum-1234567890')

const SEED = {
  slug: 'users',
  branches: [{ id: 'br_01', alias: 'pin', type: 'text', policies: { classification: 'restricted' } }],
}

async function buildApp(update: ReturnType<typeof vi.fn>) {
  const repository = {
    findById: vi.fn(async () => ({ id: 'e1', pin: await privacyService.hash('old'), updated_at: 1234 })),
    update,
  }
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('getSeed', (() => SEED) as any)
    c.set('repository', repository as any)
    c.set('privacyService', privacyService)
    await next()
  })
  app.route('/', rotateFieldApp)
  return app
}

function rotate(app: Hono<{ Bindings: Env; Variables: Variables }>) {
  return app.request('/users/e1/rotate-field', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fieldAlias: 'pin', currentValue: 'old', nextValue: 'new' }),
  })
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
})
