// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — branch id allocation, integration tier. An id minted for a branch that lacks one must
 * never collide with an explicit id sent in the same request, nor recycle the id of a stored branch
 * (a recycled id lets a new definition inherit the column of a dropped one).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import type { Seed } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('seeds slice — branch id allocation (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function storedDefinition(slug: string): Promise<Seed> {
    const record = await (await admin.get(`/api/seeds/${slug}`)).json<{ definition: Seed }>()
    return record.definition
  }

  describe('POST /api/seeds', () => {
    it('an id-less branch listed before an explicit br_01 is given a free id instead of 422 duplicate', async () => {
      const response = await admin.post('/api/seeds', {
        slug: 'mixed_ids',
        label: 'Mixed ids',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' },
          { id: 'br_01', alias: 'subtitle', label: 'Subtitle', type: 'text' },
        ],
      })

      expect(response.status).toBe(201)
      const ids = (await storedDefinition('mixed_ids')).branches.map(b => b.id)
      expect(new Set(ids).size).toBe(2)
      expect(ids[1]).toBe('br_01')
    })
  })

  describe('POST /api/seeds/:slug/mcp-apply', () => {
    it('an id-less branch listed before an explicit br_01 is given a free id instead of 422 duplicate', async () => {
      const expectedVersion = Number((await admin.get('/api/seeds')).headers.get('X-Schema-Version'))

      const response = await admin.post('/api/seeds/mixed_mcp/mcp-apply', {
        expectedVersion,
        candidate: {
          label: 'Mixed mcp',
          displayNameAlias: 'title',
          branches: [
            { alias: 'title', label: 'Title', type: 'text' },
            { id: 'br_01', alias: 'subtitle', label: 'Subtitle', type: 'text' },
          ],
        },
      })

      expect(response.status).toBe(200)
      const ids = (await storedDefinition('mixed_mcp')).branches.map(b => b.id)
      expect(new Set(ids).size).toBe(2)
      expect(ids[1]).toBe('br_01')
    })
  })

  describe('PUT /api/seeds/:slug', () => {
    it('omitting the highest-id branch and adding an id-less one does not recycle the stored id', async () => {
      await admin.post('/api/seeds', {
        slug: 'ledger',
        label: 'Ledger',
        branches: [
          { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
          { alias: 'memo', label: 'Memo', type: 'text' },
          { alias: 'amount', label: 'Amount', type: 'number' },
        ],
      })
      const stored = await storedDefinition('ledger')
      const highest = stored.branches.reduce((a, b) => (a.id > b.id ? a : b))
      const kept = stored.branches.filter(b => b.id !== highest.id)

      const response = await admin.put('/api/seeds/ledger', {
        ...stored,
        branches: [...kept, { alias: 'fresh_note', label: 'Fresh note', type: 'text' }],
      })

      expect(response.status).toBe(200)
      const added = (await storedDefinition('ledger')).branches.find(b => b.alias === 'fresh_note')
      expect(added?.id).not.toBe(highest.id)
    })
  })
})
