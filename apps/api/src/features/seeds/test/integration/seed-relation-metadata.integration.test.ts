// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import type { Branch, Seed } from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const changes: Array<{ name: string; alias: string; update: Partial<Branch> }> = [
  { name: 'single relation to multiple', alias: 'author_id', update: { multiple: true } },
  { name: 'multiple relation to single', alias: 'related_posts', update: { multiple: false } },
  { name: 'relation target', alias: 'author_id', update: { targetSeed: 'categories' } },
  { name: 'relation delete behavior', alias: 'author_id', update: { onDelete: 'RESTRICT' } },
]

describe('seeds slice — relation metadata (real D1)', () => {
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

  async function candidateWith(change: (typeof changes)[number]): Promise<{ stored: Seed; candidate: Seed }> {
    const record = await (await admin.get('/api/seeds/posts')).json<{ definition: Seed }>()
    const stored = record.definition
    const candidate = {
      ...stored,
      branches: stored.branches.map(branch => branch.alias === change.alias ? { ...branch, ...change.update } : branch),
    }
    return { stored, candidate }
  }

  async function storedDefinition(): Promise<Seed> {
    const row = await harness.db.prepare('SELECT definition FROM seeds WHERE slug = ?').bind('posts').first<{ definition: string }>()
    if (!row) throw new Error('posts seed missing')
    return JSON.parse(row.definition) as Seed
  }

  describe('POST /api/seeds/:slug/mcp-plan', () => {
    it.each(changes)('classifies $name as destructive without changing the stored definition', async (change) => {
      const { stored, candidate } = await candidateWith(change)

      // The additive planner cannot move existing FK or junction values when relation storage changes.
      const response = await admin.post('/api/seeds/posts/mcp-plan', { candidate })

      expect(response.status).toBe(200)
      const body = await response.json<{ classification: string; requiresConfirmation: boolean; applicable: boolean; blockedReasons: string[]; statements: string[] }>()
      expect(body.classification).toBe('destructive')
      expect(body.requiresConfirmation).toBe(true)
      expect(body.applicable).toBe(false)
      expect(body.blockedReasons).toContainEqual(expect.stringContaining(change.alias))
      expect(body.statements).toEqual([])

      expect(await storedDefinition()).toEqual(stored)
    })
  })

  describe('POST /api/seeds/:slug/mcp-apply', () => {
    it.each(changes)('rejects $name and preserves the stored definition', async (change) => {
      const { stored, candidate } = await candidateWith(change)
      const versionResponse = await admin.get('/api/seeds')
      const expectedVersion = Number(versionResponse.headers.get('X-Schema-Version'))

      const response = await admin.post('/api/seeds/posts/mcp-apply', { candidate, expectedVersion })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('destructive-change-not-supported')

      expect(await storedDefinition()).toEqual(stored)
    })
  })

  describe('PUT /api/seeds/:slug', () => {
    it.each(changes)('rejects $name and preserves the stored definition', async (change) => {
      // Canonical seeds are manifest-owned; PUT reaches its branch gate only for runtime-owned seeds.
      await harness.db.prepare("UPDATE seeds SET source = 'runtime' WHERE slug = 'posts'").run()
      const { stored, candidate } = await candidateWith(change)

      const response = await admin.put('/api/seeds/posts', candidate)

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('relation-change-not-supported')

      expect(await storedDefinition()).toEqual(stored)
    })
  })
})
