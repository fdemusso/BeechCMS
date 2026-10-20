// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, seedScaleEntries, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — bulk edit scale tier', () => {
  let harness: TestHarness
  let admin: TestClient
  let targetIds: string[] = []

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    
    await seedScaleEntries(harness.db, 5000)

    // Collect 500 deterministic IDs to bulk edit (max bulk size)
    for (let i = 0; i < 500; i++) {
      targetIds.push(`00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`)
    }
  })

  describe('PATCH /api/content/posts/bulk', () => {
    it('executes a bulk update of 500 items within performance bounds (< 800ms)', async () => {
      const start = performance.now()
      const response = await admin.patch('/api/content/posts/bulk', {
        ids: targetIds,
        fields: { title: 'Bulk Updated Title' }
      })
      const end = performance.now()

      expect(response.status).toBe(200)
      const body = await response.json<{ updated: number }>()
      
      expect(body.updated).toBe(500)
      expect(end - start).toBeLessThan(800)
    })
  })
})
