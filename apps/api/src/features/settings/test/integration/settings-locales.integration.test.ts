// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Settings slice — locales integration tier. Covers GET/PUT /api/settings's content-locale
 * contract against real D1: the implicit single-language default, validation of the stored
 * shape, and the no-data-loss guarantee when a locale is removed from the project configuration.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SettingsBody {
  defaultLanguage: string
  locales: string[]
  defaultLocale: string
}

/** 51 distinct, individually-valid locale codes — one past MAX_LOCALES (50). */
function fiftyOneLocaleCodes(): string[] {
  const codes: string[] = []
  for (let i = 0; i < 51; i++) {
    const first = String.fromCharCode(97 + Math.floor(i / 26))
    const second = String.fromCharCode(97 + (i % 26))
    codes.push(`${first}${second}`)
  }
  return codes
}

describe('settings slice — locales (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // The harness resets content tables only (packages/testing/src/seeds/provision.ts); site_settings
    // is a shared key-value table that outlives a single test unless cleared here.
    await harness.db.prepare('DELETE FROM site_settings').run()
  })

  describe('GET /api/settings', () => {
    it('exposes the implicit single-language config when languages were never configured', async () => {
      const response = await admin.get('/api/settings')

      expect(response.status).toBe(200)
      const body = await response.json<SettingsBody>()
      expect(body.locales).toEqual([body.defaultLanguage])
      expect(body.defaultLocale).toBe(body.defaultLanguage)
    })
  })

  describe('PUT /api/settings', () => {
    it('persists locales and defaultLocale', async () => {
      const response = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })

      expect(response.status).toBe(200)
      const getBody = await (await admin.get('/api/settings')).json<SettingsBody>()
      expect(getBody.locales).toEqual(['it', 'en'])
      expect(getBody.defaultLocale).toBe('it')
      const row = await harness.db.prepare(`SELECT value FROM site_settings WHERE key = 'locales'`).first<{ value: string }>()
      expect(row?.value).toBe('["it","en"]')
    })

    it('refuses malformed locales with 400 settings-invalid-locales and stores nothing', async () => {
      const cases: unknown[] = [[], ['it', 'it'], ['IT'], 'it', fiftyOneLocaleCodes()]

      for (const locales of cases) {
        const response = await admin.put('/api/settings', { locales })

        expect(response.status).toBe(400)
        const body = await response.json<{ type: string }>()
        expect(body.type).toBe('settings-invalid-locales')
        const row = await harness.db.prepare(`SELECT COUNT(*) AS n FROM site_settings WHERE key = 'locales'`).first<{ n: number }>()
        expect(row?.n).toBe(0)
      }
    })

    it('refuses a defaultLocale outside locales with 400 settings-default-locale-not-in-locales', async () => {
      const response = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'fr' })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('settings-default-locale-not-in-locales')
      const row = await harness.db.prepare(`SELECT COUNT(*) AS n FROM site_settings WHERE key = 'locales'`).first<{ n: number }>()
      expect(row?.n).toBe(0)
    })

    it('removing a locale leaves stored translations untouched', async () => {
      const createdSeed = await admin.post('/api/seeds', {
        slug: 'loc_settings',
        label: 'Loc Settings',
        branches: [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }],
      })
      expect(createdSeed.status).toBe(201) // precondition
      const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
      expect(configured.status).toBe(200) // precondition
      const createdEntry = await admin.post('/api/content/loc_settings', {
        title: { it: 'Scarpa', en: 'Shoe' },
        slug: 'scarpa',
      })
      expect(createdEntry.status).toBe(201) // precondition

      const response = await admin.put('/api/settings', { locales: ['it'] })

      expect(response.status).toBe(200)
      const row = await harness.db
        .prepare(`SELECT title FROM content_loc_settings WHERE slug = ?`)
        .bind('scarpa')
        .first<{ title: string }>()
      expect(JSON.parse(row?.title ?? 'null')).toEqual({ it: 'Scarpa', en: 'Shoe' })
    })
  })
})
