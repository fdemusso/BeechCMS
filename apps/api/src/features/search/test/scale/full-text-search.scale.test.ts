// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, seedScaleEntries, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('search slice — scale tier', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    
    await seedScaleEntries(harness.db, 5000)
  })

  describe('GET /api/search', () => {
    it('returns search results across 5000 items within performance bounds (< 250ms)', async () => {
      const start = performance.now()
      const response = await admin.get('/api/search?q=Scale&limit=50')
      const end = performance.now()

      expect(response.status).toBe(200)
      const body = await response.json<{ items: unknown[], total: number }>()
      
      expect(body.items).toHaveLength(50)
      expect(body.total).toBe(5050)
      expect(end - start).toBeLessThan(250)
    })
  })
})
