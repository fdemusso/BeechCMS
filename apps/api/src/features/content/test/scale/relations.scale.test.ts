// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, seedScaleEntries, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — relations hydration scale tier', () => {
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

  describe('GET /api/content/posts', () => {
    it('hydrates relations efficiently without N+1 regression (< 200ms)', async () => {
      // By fetching with limits and filtering, we trigger relation hydration
      const start = performance.now()
      const response = await admin.get('/api/content/posts?limit=50&sortBy=created_at&sortDir=desc')
      const end = performance.now()

      expect(response.status).toBe(200)
      const body = await response.json<{ 
        items: unknown[], 
        total: number,
        relations: Record<string, Record<string, string>>
      }>()
      
      expect(body.items).toHaveLength(50)
      expect(body.total).toBe(5000)
      // Assert that relations map is populated
      expect(Object.keys(body.relations.author_id).length).toBeGreaterThan(0)
      expect(end - start).toBeLessThan(200)
    })
  })
})
