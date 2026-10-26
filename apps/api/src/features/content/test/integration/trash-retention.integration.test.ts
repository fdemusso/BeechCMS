// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — Trash retention integration tier. Covers the effective `retentionDays` the trash
 * list exposes and the retention sweep against real D1 and a real (simulated) R2 ledger.
 * The cron has no HTTP surface, so the act of the sweep cases is the `runRetentionSweep` call itself.
 * Media deletion is covered in retention-sweep.test.ts because uploads need the forks tier.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, type DeletionLedgerEvent } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { D1ContentRepository } from '../../../../shared/db/repositories/content.repository.d1'
import { D1MediaRepository } from '../../../../shared/db/repositories/media.repository.d1'
import { D1SiteSettingsRepository } from '../../../../shared/db/repositories/site-settings.repository.d1'
import { D1SystemStatsRepository } from '../../../../shared/db/repositories/system-stats.repository.d1'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
import { R2DeletionLedger } from '../../../../shared/storage/deletion-ledger'
import { R2BucketAdapter } from '../../../../shared/storage/r2-bucket'
import { runRetentionSweep } from '../../jobs/retention-sweep'

const SECONDS_PER_DAY = 86_400

const BRANCHES = [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }] as const

// The harness does not run validateSeeds, so retentionDays: 0 is accepted here; Fatal 13 is covered in seed-validation.test.ts.
const retDefaultSeed = defineSeed({
  slug: 'ret_default',
  label: 'Ret Default',
  labelPlural: 'Ret Defaults',
  displayNameAlias: 'title',
  branches: [...BRANCHES],
})

const retOverrideSeed = defineSeed({
  slug: 'ret_override',
  label: 'Ret Override',
  labelPlural: 'Ret Overrides',
  displayNameAlias: 'title',
  retentionDays: 30,
  branches: [...BRANCHES],
})

const retNeverSeed = defineSeed({
  slug: 'ret_never',
  label: 'Ret Never',
  labelPlural: 'Ret Nevers',
  displayNameAlias: 'title',
  retentionDays: 0,
  branches: [...BRANCHES],
})

const SEEDS = [retDefaultSeed, retOverrideSeed, retNeverSeed]

describe('content slice — trash retention (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  const mediaBucket = () => (env as unknown as { MEDIA_BUCKET: R2Bucket }).MEDIA_BUCKET

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: SEEDS,
      env: { MEDIA_BUCKET: mediaBucket() },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // The harness resets content tables only; site_settings outlives a single test unless cleared here.
    await harness.db.prepare('DELETE FROM site_settings').run()
  })

  async function createTrashedEntry(seedSlug: string, title: string): Promise<string> {
    const created = await admin.post(`/api/content/${seedSlug}`, { title, slug: title.toLowerCase() })
    expect(created.status).toBe(201)
    const { id } = await created.json<{ id: string }>()
    const deleted = await admin.delete(`/api/content/${seedSlug}/${id}`)
    expect(deleted.status).toBe(200)
    return id
  }

  function daysFromNow(days: number): number {
    return harness.clock.nowSeconds() + days * SECONDS_PER_DAY
  }

  // Time is passed explicitly: advancing the harness clock would expire the fake auth tokens.
  function runSweep(atSeconds: number) {
    const bucket = new R2BucketAdapter(mediaBucket(), '')
    return runRetentionSweep(
      {
        repository: new D1ContentRepository(env.DB, undefined, undefined, undefined, new R2DeletionLedger(bucket), harness.clock),
        siteSettingsRepository: new D1SiteSettingsRepository(env.DB),
        seeds: SEEDS,
        media: {
          var: {
            bucket,
            mediaRepository: new D1MediaRepository(env.DB),
            systemStatsRepository: new D1SystemStatsRepository(env.DB),
          },
        },
      },
      atSeconds,
    )
  }

  async function ledgerEvent(seedSlug: string, id: string): Promise<DeletionLedgerEvent | null> {
    const object = await mediaBucket().get(`_deletion-ledger/${seedSlug}/${id}.json`)
    return object ? await object.json<DeletionLedgerEvent>() : null
  }

  async function rowCount(seedSlug: string, id: string): Promise<number> {
    const row = await harness.db.prepare(`SELECT COUNT(*) AS n FROM content_${seedSlug} WHERE id = ?`).bind(id).first<{ n: number }>()
    return row?.n ?? 0
  }

  describe('GET /api/content/:slug/trash', () => {
    it('exposes retentionDays 14 for a seed with no override when retention was never configured', async () => {
      const response = await admin.get('/api/content/ret_default/trash')

      expect(response.status).toBe(200)
      const body = await response.json<{ retentionDays: number }>()
      expect(body.retentionDays).toBe(14)
    })

    it('exposes the global value set through PUT /api/settings', async () => {
      const saved = await admin.put('/api/settings', { trashRetentionDays: 7 })
      expect(saved.status).toBe(200)

      const response = await admin.get('/api/content/ret_default/trash')

      expect(response.status).toBe(200)
      const body = await response.json<{ retentionDays: number }>()
      expect(body.retentionDays).toBe(7)
    })

    it("exposes the seed's own retentionDays over the global value", async () => {
      const overrideResponse = await admin.get('/api/content/ret_override/trash')
      const neverResponse = await admin.get('/api/content/ret_never/trash')

      expect(overrideResponse.status).toBe(200)
      expect(neverResponse.status).toBe(200)
      const override = await overrideResponse.json<{ retentionDays: number }>()
      const never = await neverResponse.json<{ retentionDays: number }>()
      expect([override.retentionDays, never.retentionDays]).toEqual([30, 0])
    })
  })

  describe('runRetentionSweep', () => {
    it('purges an entry trashed 15 days ago on a seed with no override, writing the ledger with actorId null first', async () => {
      const id = await createTrashedEntry('ret_default', 'Old')

      const result = await runSweep(daysFromNow(15))

      expect(result.purged).toEqual([{ seedSlug: 'ret_default', id }])
      expect(await rowCount('ret_default', id)).toBe(0)
      const event = await ledgerEvent('ret_default', id)
      expect(event).toMatchObject({ seedSlug: 'ret_default', entryId: id, actorId: null, reason: 'purge' })
    })

    it('keeps an entry trashed 13 days ago', async () => {
      const id = await createTrashedEntry('ret_default', 'Recent')

      const result = await runSweep(daysFromNow(13))

      expect(result.purged).toEqual([])
      const row = await harness.db.prepare('SELECT deleted_at FROM content_ret_default WHERE id = ?').bind(id).first<{ deleted_at: number | null }>()
      expect(row?.deleted_at).toBe(harness.clock.nowSeconds())
      expect(await ledgerEvent('ret_default', id)).toBeNull()
    })

    it('never purges on a seed with retentionDays 0, even 1000 days later', async () => {
      const id = await createTrashedEntry('ret_never', 'Forever')

      const result = await runSweep(daysFromNow(1000))

      expect(result.purged).toEqual([])
      expect(await rowCount('ret_never', id)).toBe(1)
    })

    it("keeps an entry at day 20 on a seed with retentionDays 30", async () => {
      const id = await createTrashedEntry('ret_override', 'Kept')

      const result = await runSweep(daysFromNow(20))

      expect(result.purged).toEqual([])
      expect(await rowCount('ret_override', id)).toBe(1)
    })

    it("purges an entry at day 31 on a seed with retentionDays 30", async () => {
      const id = await createTrashedEntry('ret_override', 'Expired')

      const result = await runSweep(daysFromNow(31))

      expect(result.purged).toEqual([{ seedSlug: 'ret_override', id }])
      expect(await rowCount('ret_override', id)).toBe(0)
    })

    it('keeps every non-overridden entry at day 400 when the global retention is 0', async () => {
      const saved = await admin.put('/api/settings', { trashRetentionDays: 0 })
      expect(saved.status).toBe(200)
      const id = await createTrashedEntry('ret_default', 'Global zero')

      const result = await runSweep(daysFromNow(400))

      expect(result.purged).toEqual([])
      expect(await rowCount('ret_default', id)).toBe(1)
    })

    it('never touches a live entry whose created_at is older than the window', async () => {
      const created = await admin.post('/api/content/ret_default', { title: 'Live', slug: 'live' })
      expect(created.status).toBe(201)
      const { id } = await created.json<{ id: string }>()

      const result = await runSweep(daysFromNow(400))

      expect(result.purged).toEqual([])
      const row = await harness.db.prepare('SELECT deleted_at FROM content_ret_default WHERE id = ?').bind(id).first<{ deleted_at: number | null }>()
      expect(row?.deleted_at).toBeNull()
    })
  })
})
