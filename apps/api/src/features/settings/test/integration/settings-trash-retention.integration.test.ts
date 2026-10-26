// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Settings slice — trash retention integration tier. Covers the global `trashRetentionDays` key of
 * GET/PUT /api/settings against real D1: the default, persistence including 0 (never purge), and
 * rejection of malformed values with nothing stored.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SettingsBody {
  trashRetentionDays: number
}

describe('settings slice — trash retention (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // The harness resets content tables only; site_settings is a shared key-value table that outlives a single test.
    await harness.db.prepare('DELETE FROM site_settings').run()
  })

  describe('GET /api/settings', () => {
    it('exposes trashRetentionDays 14 when it was never configured', async () => {
      const response = await admin.get('/api/settings')

      expect(response.status).toBe(200)
      const body = await response.json<SettingsBody>()
      expect(body.trashRetentionDays).toBe(14)
    })
  })

  describe('PUT /api/settings', () => {
    it('persists trashRetentionDays 30', async () => {
      const response = await admin.put('/api/settings', { trashRetentionDays: 30 })

      expect(response.status).toBe(200)
      const getBody = await (await admin.get('/api/settings')).json<SettingsBody>()
      expect(getBody.trashRetentionDays).toBe(30)
      const row = await harness.db.prepare(`SELECT value FROM site_settings WHERE key = 'trashRetentionDays'`).first<{ value: string }>()
      expect(row?.value).toBe('30')
    })

    it('persists 0 (never purge) and reads it back as 0', async () => {
      const response = await admin.put('/api/settings', { trashRetentionDays: 0 })

      expect(response.status).toBe(200)
      const getBody = await (await admin.get('/api/settings')).json<SettingsBody>()
      expect(getBody.trashRetentionDays).toBe(0)
      const row = await harness.db.prepare(`SELECT value FROM site_settings WHERE key = 'trashRetentionDays'`).first<{ value: string }>()
      expect(row?.value).toBe('0')
    })

    it('refuses malformed trashRetentionDays with 400 settings-invalid-trash-retention and stores nothing', async () => {
      const cases: unknown[] = [-1, 1.5, '14', null, 36501]

      for (const trashRetentionDays of cases) {
        const response = await admin.put('/api/settings', { trashRetentionDays })

        expect(response.status).toBe(400)
        const body = await response.json<{ type: string }>()
        expect(body.type).toBe('settings-invalid-trash-retention')
        const row = await harness.db.prepare(`SELECT COUNT(*) AS n FROM site_settings WHERE key = 'trashRetentionDays'`).first<{ n: number }>()
        expect(row?.n).toBe(0)
      }
    })
  })
})
