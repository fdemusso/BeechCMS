// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Seeds slice — manifest ownership integration tier.
 * Covers the 409 guard that blocks interactive (dashboard/REST) mutation of a
 * seed owned by beech.schema.ts (source='code'), and proves the MCP control
 * plane and seed creation stay unaffected by it.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SeedRecordBody {
  slug: string
  definition: { branches: Array<{ id: string; alias: string }> }
  status: 'active' | 'deleted'
  source: 'code' | 'runtime'
}

describe('seeds slice — manifest ownership (real D1)', () => {
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

  async function createSeed(slug: string): Promise<void> {
    const response = await admin.post('/api/seeds', {
      slug,
      label: 'Article',
      branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
    })
    if (response.status !== 201) throw new Error(`createSeed: POST /api/seeds returned ${response.status}`)
  }

  // The CLI's manifest apply command writes source='code' on creation, but we keep this raw UPDATE
  // helper to arrange manifest-owned seeds for the interactive endpoints without going through the
  // control plane. The column, its CHECK and its default exist in 0000_v040_base.sql.
  async function markManifestOwned(slug: string): Promise<void> {
    await harness.db.prepare(`UPDATE seeds SET source = 'code' WHERE slug = ?`).bind(slug).run()
  }

  describe('PUT /api/seeds/:slug', () => {
    it('rejects a manifest-owned seed with 409 and leaves the stored definition unchanged', async () => {
      await createSeed('seed_put_owned')
      await markManifestOwned('seed_put_owned')

      const response = await admin.put('/api/seeds/seed_put_owned', { branches: [{ alias: 'title', type: 'text' }] })

      expect(response.status).toBe(409)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('seed-manifest-owned')

      const stored = await admin.get('/api/seeds/seed_put_owned')
      const record = await stored.json<SeedRecordBody>()
      expect(record.definition.branches).toHaveLength(1)
    })
  })

  describe('POST /api/seeds/:slug/branches', () => {
    it('rejects a manifest-owned seed with 409 and adds no physical column', async () => {
      await createSeed('seed_branches_owned')
      await markManifestOwned('seed_branches_owned')

      const response = await admin.post('/api/seeds/seed_branches_owned/branches', { alias: 'subtitle', label: 'Subtitle', type: 'text' })

      expect(response.status).toBe(409)
      const columns = await harness.db.prepare('PRAGMA table_info(content_seed_branches_owned)').all()
      expect(columns.results?.some((c: unknown) => (c as { name: string }).name === 'subtitle')).toBe(false)
    })
  })

  describe('DELETE /api/seeds/:slug', () => {
    it('rejects a manifest-owned seed with 409 and leaves its status active', async () => {
      await createSeed('seed_delete_owned')
      await markManifestOwned('seed_delete_owned')

      const response = await admin.delete('/api/seeds/seed_delete_owned')

      expect(response.status).toBe(409)
      const stored = await admin.get('/api/seeds/seed_delete_owned')
      const record = await stored.json<SeedRecordBody>()
      expect(record.status).toBe('active')
    })
  })

  describe('destructive routes', () => {
    it('reject a manifest-owned seed with 409 on every one of the four destructive operations', async () => {
      await createSeed('seed_destructive_owned')
      await markManifestOwned('seed_destructive_owned')

      const cases: Array<{ method: 'delete' | 'patch'; path: string; body: unknown }> = [
        { method: 'delete', path: '/api/seeds/seed_destructive_owned/hard', body: { confirm: 'seed_destructive_owned' } },
        { method: 'delete', path: '/api/seeds/seed_destructive_owned/branches/br_ignored', body: {} },
        { method: 'patch', path: '/api/seeds/seed_destructive_owned/branches/br_ignored/rename', body: { newAlias: 'renamed' } },
        { method: 'patch', path: '/api/seeds/seed_destructive_owned/branches/br_ignored/retype', body: { newType: 'text' } },
      ]

      for (const testCase of cases) {
        const response = testCase.method === 'delete'
          ? await admin.delete(testCase.path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testCase.body) })
          : await admin.patch(testCase.path, testCase.body)
        expect(response.status).toBe(409)
      }
    })
  })

  describe('a source=runtime seed', () => {
    it('is unaffected by the guard: PUT succeeds with 200 and the new branch is readable back', async () => {
      await createSeed('seed_runtime_put')
      const existing = await (await admin.get('/api/seeds/seed_runtime_put')).json<SeedRecordBody & { definition: Record<string, unknown> }>()

      const response = await admin.put('/api/seeds/seed_runtime_put', {
        ...existing.definition,
        branches: [...existing.definition.branches, { alias: 'subtitle', label: 'Subtitle', type: 'text' }],
      })

      expect(response.status).toBe(200)
      const stored = await admin.get('/api/seeds/seed_runtime_put')
      const record = await stored.json<SeedRecordBody>()
      expect(record.definition.branches.map(b => b.alias)).toContain('subtitle')
    })
  })

  describe('POST /api/seeds/:slug/mcp-apply', () => {
    it('records source=code when a manifest apply creates the seed', async () => {
      const candidate = { slug: 'seed_mcp_new', branches: [{ alias: 'title', type: 'text' }] }
      const plan = await admin.post('/api/seeds/seed_mcp_new/mcp-plan', { candidate })
      const { expectedVersion } = await plan.json<{ expectedVersion: number }>()

      const response = await admin.post('/api/seeds/seed_mcp_new/mcp-apply', { candidate, expectedVersion, source: 'code' })

      expect(response.status).toBe(200)
      const stored = await admin.get('/api/seeds/seed_mcp_new')
      const record = await stored.json<SeedRecordBody>()
      expect(record.source).toBe('code')
    })

    it('leaves a dashboard-created seed as runtime when a manifest apply targets it', async () => {
      await createSeed('seed_mcp_runtime')
      const existing = await (await admin.get('/api/seeds/seed_mcp_runtime')).json<SeedRecordBody & { definition: { branches: unknown[] } }>()

      const candidate = { ...existing.definition, slug: 'seed_mcp_runtime', branches: [...existing.definition.branches, { alias: 'subtitle', label: 'Subtitle', type: 'text' }] }
      const plan = await admin.post('/api/seeds/seed_mcp_runtime/mcp-plan', { candidate })
      const { expectedVersion } = await plan.json<{ expectedVersion: number }>()

      // ON CONFLICT DO UPDATE clause deliberately omits source; ownership does not transfer
      const response = await admin.post('/api/seeds/seed_mcp_runtime/mcp-apply', { candidate, expectedVersion, source: 'code' })

      expect(response.status).toBe(200)
      const stored = await admin.get('/api/seeds/seed_mcp_runtime')
      const record = await stored.json<SeedRecordBody>()
      expect(record.source).toBe('runtime')
    })

    it('succeeds against a manifest-owned seed and leaves source unchanged as code', async () => {
      await createSeed('seed_mcp_owned')
      await markManifestOwned('seed_mcp_owned')
      const existing = await (await admin.get('/api/seeds/seed_mcp_owned')).json<SeedRecordBody & { definition: { branches: unknown[] } }>()

      const candidate = { ...existing.definition, slug: 'seed_mcp_owned', branches: [...existing.definition.branches, { alias: 'subtitle', label: 'Subtitle', type: 'text' }] }
      const plan = await admin.post('/api/seeds/seed_mcp_owned/mcp-plan', { candidate })
      const { expectedVersion } = await plan.json<{ expectedVersion: number }>()

      const response = await admin.post('/api/seeds/seed_mcp_owned/mcp-apply', { candidate, expectedVersion })

      expect(response.status).toBe(200)
      const stored = await admin.get('/api/seeds/seed_mcp_owned')
      const record = await stored.json<SeedRecordBody>()
      expect(record.source).toBe('code')
    })
  })

  describe('POST /api/seeds', () => {
    it('creates a brand-new seed with 201 while a manifest-owned seed exists', async () => {
      await createSeed('seed_post_owned')
      await markManifestOwned('seed_post_owned')

      const response = await admin.post('/api/seeds', {
        slug: 'seed_post_new',
        label: 'Page',
        branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
      })

      expect(response.status).toBe(201)
    })
  })
})
