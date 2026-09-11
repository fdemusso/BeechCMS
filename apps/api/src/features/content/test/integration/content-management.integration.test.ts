// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — integration tier.
 * Covers the protected content CRUD surface against real D1 through the full
 * middleware chain. Upload/media cases need R2 and stay in the forks tier
 * (apps/api/test/flow-media-assets.test.ts) — see rule 4 of the sprint's pilot port.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import {
  createTestHarness, seedCanonicalEntries,
  UUID_V4_PATTERN, type TestHarness, type TestClient,
} from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()               // per-isolate seed cache; still required
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await seedCanonicalEntries(harness)
  })

  describe('GET /api/content/:slug', () => {
    it('lists private branches for an authenticated admin', async () => {
      const response = await admin.get('/api/content/posts')

      expect(response.status).toBe(200)
      const body = await response.json<Array<Record<string, unknown>>>()
      expect(body[0].internal_note).toBe('SECRET')
    })
  })

  describe('POST /api/content/:slug', () => {
    it('mints entry ids in the exact format the dashboard round-trips', async () => {
      const created = await admin.post('/api/content/posts', { title: 'New', slug: 'new-post' })

      expect(created.status).toBe(201)
      const { id } = await created.json<{ id: string }>()
      expect(id).toMatch(UUID_V4_PATTERN)

      // The regression guard: the id that was just minted must address the entry it created.
      const fetched = await admin.get(`/api/content/posts/${id}`)
      expect(fetched.status).toBe(200)
    })
  })

  describe('authentication', () => {
    it('rejects a request whose token has expired', async () => {
      harness.clock.advance(16 * 60 * 1000)    // default token TTL is 900s

      const response = await admin.get('/api/content/posts')

      expect(response.status).toBe(401)
    })
  })
})
