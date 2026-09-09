// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { repositoryMiddleware } from '../src/middleware/repository.middleware'
import type { AppEnv } from '../src/types'
import type { Seed } from '@beechcms/core'

function makeMockDb() {
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  const firstMock = vi.fn().mockResolvedValue(null)
  const allMock = vi.fn().mockResolvedValue({ results: [] })
  const bindMock = vi.fn((..._args: any[]) => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  const batchMock = vi.fn().mockResolvedValue([])
  return { db: { prepare: prepareMock, batch: batchMock } as any, prepareMock, bindMock, runMock, firstMock, allMock, batchMock }
}

const PRIVACY_SEED: Seed = {
  slug: 'users',
  displayNameAlias: 'name',
  label: 'User',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', policies: { privacy: 'plain' } },
    { id: 'br_02', alias: 'ssn', label: 'SSN', type: 'text', policies: { privacy: 'encrypt' } },
  ],
}

describe('repositoryMiddleware — Privacy Integration', () => {
  it('injects functional privacyService from PRIVACY_MASTER_KEY and encrypts fields via injected repository', async () => {
    const app = new Hono<AppEnv>()
    const { db, bindMock } = makeMockDb()

    // 1. Setup middleware with a simulated ENV
    app.use('*', async (c, next) => {
      c.env = {
        DB: db,
        PRIVACY_MASTER_KEY: 'test-master-key-32-chars-minimum-1234567890',
        JWT_SECRET: 'secret',
      } as any
      await next()
    })
    app.use('*', repositoryMiddleware())

    // 2. Test route that acts on the injected context
    app.get('/test', async (c) => {
      const privacyService = c.get('privacyService')
      expect(privacyService).toBeDefined()

      // a) verify c.get('privacyService') is functional
      const plain = 'secret-value'
      const encrypted = await privacyService.encrypt(plain)
      expect(encrypted).toMatch(/^v1:/)
      const decrypted = await privacyService.decrypt(encrypted)
      expect(decrypted).toBe(plain)

      // b) verify the repository encrypts fields
      const repo = c.get('repository')
      await repo.create(PRIVACY_SEED, 'id_1', 'user-1', 'published', {
        name: 'John Doe',
        ssn: 'my-ssn-1234',
      })

      return c.json({ ok: true })
    })

    const res = await app.request('/test')
    expect(res.status).toBe(200)

    // Verify bind was called with ciphertext
    const boundArgs = bindMock.mock.calls.find((call) => call[0] === 'id_1')
    expect(boundArgs).toBeDefined()
    // id_1, user-1, published, John Doe, v1:...
    const ssnArg = boundArgs![4]
    expect(typeof ssnArg).toBe('string')
    expect(ssnArg).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
  })
})
