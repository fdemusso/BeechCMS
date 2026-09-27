// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — localized list, integration tier. Covers `GET /api/content/:slug` against real D1:
 * sort and filter compare the default-locale value, relation labels resolve to it, and item data still
 * carries the stored dictionaries (the entry editor and API clients need every translation).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const brandsSeed = defineSeed({
  slug: 'loc_list_brands', label: 'Brands', displayNameAlias: 'name',
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text', localized: true }],
})
const itemsSeed = defineSeed({
  slug: 'loc_list_items', label: 'Items', displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true },
    { id: 'br_02', alias: 'brand_id', label: 'Brand', type: 'relation', targetSeed: 'loc_list_brands' },
  ],
})

describe('content slice — localized list (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [brandsSeed, itemsSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // site_settings is a shared key-value table the harness never resets between tests.
    await harness.db.prepare('DELETE FROM site_settings').run()
  })

  async function createItem(data: Record<string, unknown>): Promise<string> {
    const response = await admin.post('/api/content/loc_list_items', { ...data, status: 'published' })
    expect(response.status).toBe(201) // precondition
    const { id } = await response.json<{ id: string }>()
    return id
  }

  describe('GET /api/content/:slug', () => {
    it('sorting on a localized field orders by the default-locale value, not the stored JSON text', async () => {
      const orangeId = await createItem({ title: { it: 'Arancia', en: 'Orange' } })
      const appleId = await createItem({ title: { it: 'Mela', en: 'Apple' } })
      const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'en' })
      expect(configured.status).toBe(200) // precondition

      const response = await admin.get('/api/content/loc_list_items?sortBy=title&sortDir=asc&page=1&limit=10')

      expect(response.status).toBe(200)
      // Regression guard: the stored text starts with `{"it":…`, so raw JSON order gives Orange first.
      // items[].data is never resolved server-side (VETO §4): assert on order, not on the dictionary values.
      const body = await response.json<{ items: { id: string }[] }>()
      expect(body.items.map((item) => item.id)).toEqual([appleId, orangeId])
    })

    it('a filter on a localized field compares the default-locale value', async () => {
      const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
      expect(configured.status).toBe(200) // precondition
      await createItem({ title: { it: 'Arancia', en: 'Orange' } })
      const melaId = await createItem({ title: { it: 'Mela', en: 'Apple' } })

      const filter = encodeURIComponent(JSON.stringify({
        title: { columnId: 'title', type: 'text', conditions: [{ op: 'eq', value: 'Mela' }] },
      }))
      const response = await admin.get(`/api/content/loc_list_items?page=1&limit=10&filters=${filter}`)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: { id: string }[]; total: number }>()
      expect(body.total).toBe(1)
      expect(body.items[0].id).toBe(melaId)
    })

    it('the relations map labels a localized target in the default locale', async () => {
      const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
      expect(configured.status).toBe(200) // precondition
      const brandResponse = await admin.post('/api/content/loc_list_brands', { name: { it: 'Rosso', en: 'Red' }, status: 'published' })
      expect(brandResponse.status).toBe(201) // precondition
      const { id: brandId } = await brandResponse.json<{ id: string }>()
      await createItem({ title: { it: 'Scarpa' }, brand_id: brandId })

      const response = await admin.get('/api/content/loc_list_items?page=1&limit=10')

      expect(response.status).toBe(200)
      // Regression guard: before this sprint, this was `String(object)` → `'[object Object]'`.
      const body = await response.json<{ relations: { brand_id: Record<string, string> } }>()
      expect(body.relations.brand_id[brandId]).toBe('Rosso')
    })

    it('list items keep the stored dictionaries', async () => {
      const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
      expect(configured.status).toBe(200) // precondition
      await createItem({ title: { it: 'Arancia', en: 'Orange' } })

      const response = await admin.get('/api/content/loc_list_items?page=1&limit=10')

      expect(response.status).toBe(200)
      // The editor and API clients need every translation; only the dashboard view resolves.
      const body = await response.json<{ items: { data: { title: Record<string, string> } }[] }>()
      expect(body.items[0].data.title).toEqual({ it: 'Arancia', en: 'Orange' })
    })
  })
})
