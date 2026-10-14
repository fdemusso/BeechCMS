// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — integration tier. The public schema projection exposes the closed vocabulary
 * and the cardinality of `tags` branches so SDK clients can render a bounded choice.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

interface PublicSchemaBranch {
  alias: string
  options?: Array<{ label: string; value: string; color: string }>
  multiple?: boolean
}

describe('public slice — integration (real D1)', () => {
  let harness: TestHarness
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    publicClient = harness.anonymous()
  })

  describe('GET /api/v1/public/:seed/schema', () => {
    it('exposes options with colors and multiple false for a single-choice tags branch', async () => {
      const response = await publicClient.get('/api/v1/public/posts/schema')

      expect(response.status).toBe(200)
      const body = await response.json<{ branches: PublicSchemaBranch[] }>()
      const priority = body.branches.find((branch) => branch.alias === 'priority')
      expect(priority?.options).toEqual([
        { label: 'low', value: 'low', color: '#64748b' },
        { label: 'high', value: 'high', color: '#ef4444' },
      ])
      expect(priority?.multiple).toBe(false)
    })

    it('exposes multiple true and no options key for a free tags branch', async () => {
      const response = await publicClient.get('/api/v1/public/posts/schema')

      expect(response.status).toBe(200)
      const body = await response.json<{ branches: PublicSchemaBranch[] }>()
      const tags = body.branches.find((branch) => branch.alias === 'tags')
      expect(tags?.multiple).toBe(true)
      expect(tags).not.toHaveProperty('options')
    })
  })
})
