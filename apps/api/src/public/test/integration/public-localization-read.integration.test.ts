// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — localized reads, integration tier. Covers language negotiation, flat and
 * all-language payloads, and filters / sort / include / subquery through the negotiated language
 * against real D1. The edge-cache key is unit-tested in public-language.test.ts (no executionCtx here).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, TEST_PUBLIC_READ_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const colorsSeed = defineSeed({
  slug: 'loc_colors', label: 'Colors', displayNameAlias: 'name', allowPublicRead: true,
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text', localized: true, policies: { public: true } }],
})
const productsSeed = defineSeed({
  slug: 'loc_products', label: 'Products', displayNameAlias: 'title', allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true, policies: { public: true } },
    { id: 'br_02', alias: 'subtitle', label: 'Subtitle', type: 'text', localized: true, policies: { public: true } },
    { id: 'br_03', alias: 'tagline', label: 'Tagline', type: 'text', localized: true, policies: { public: true, visibility: 'masked' } },
    { id: 'br_04', alias: 'color_id', label: 'Color', type: 'relation', targetSeed: 'loc_colors', policies: { public: true } },
  ],
})

describe('public slice — localized reads (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [colorsSeed, productsSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    publicClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLIC_READ_KEY })
    // site_settings is a shared key-value table the harness never resets between tests.
    await harness.db.prepare('DELETE FROM site_settings').run()
    const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
    if (configured.status !== 200) {
      throw new Error(`failed to configure locales: ${configured.status}`)
    }
  })

  async function createProduct(data: Record<string, unknown>): Promise<string> {
    const response = await admin.post('/api/content/loc_products', { ...data, status: 'published' })
    expect(response.status).toBe(201) // precondition
    const { id } = await response.json<{ id: string }>()
    return id
  }

  describe('GET /api/v1/public/:seed', () => {
    it('?lang returns localized fields as flat values in that language and names it in Content-Language', async () => {
      const id = await createProduct({ title: { it: 'Scarpa', en: 'Shoe' } })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${id}&lang=en`)

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { title: string } }>()
      expect(body.data.title).toBe('Shoe')
      expect(response.headers.get('Content-Language')).toBe('en')
      expect(response.headers.get('Vary')).toContain('Accept-Language')
    })

    it('Accept-Language picks the language when ?lang is absent, matching a regional tag to its language', async () => {
      const id = await createProduct({ title: { it: 'Scarpa', en: 'Shoe' } })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${id}`, {
        headers: { 'Accept-Language': 'en-US,it;q=0.5' },
      })

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { title: string } }>()
      expect(body.data.title).toBe('Shoe')
      expect(response.headers.get('Content-Language')).toBe('en')
    })

    it('a missing translation falls back to the default locale', async () => {
      const id = await createProduct({ title: { it: 'Scarpa' } })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${id}&lang=en`)

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { title: string } }>()
      expect(body.data.title).toBe('Scarpa')
    })

    it('?lang=all returns every translation as a dictionary and no Content-Language', async () => {
      const id = await createProduct({ title: { it: 'Scarpa', en: 'Shoe' } })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${id}&lang=all`)

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { title: Record<string, string> } }>()
      expect(body.data.title).toEqual({ it: 'Scarpa', en: 'Shoe' })
      expect(response.headers.get('Content-Language')).toBeNull()
    })

    it('an unregistered ?lang falls back to the default locale', async () => {
      const id = await createProduct({ title: { it: 'Scarpa' } })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${id}&lang=fr`)

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { title: string } }>()
      expect(body.data.title).toBe('Scarpa')
      expect(response.headers.get('Content-Language')).toBe('it')
    })

    it('a malformed ?lang is refused with 400 invalid-lang', async () => {
      const id = await createProduct({ title: { it: 'Scarpa' } })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${id}&lang=en_US`)

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/invalid-lang')
    })

    it('filters on a localized field compare against the negotiated language', async () => {
      await createProduct({ title: { it: 'Scarpa', en: 'Shoe' } })

      const cases: Array<[string, number]> = [['en', 1], ['it', 0]]
      for (const [lang, expectedTotal] of cases) {
        const filter = encodeURIComponent(JSON.stringify({ where: [{ field: 'title', op: 'eq', value: 'Shoe' }] }))
        const response = await publicClient.get(`/api/v1/public/loc_products?lang=${lang}&filter=${filter}`)

        expect(response.status).toBe(200)
        const body = await response.json<{ meta: { total: number } }>()
        expect(body.meta.total).toBe(expectedTotal)
      }
    })

    it('sorting on a localized field orders by the negotiated language', async () => {
      // Regression guard: raw JSON text sorts by the Italian value first ({"it":"Arancia"… <
      // {"it":"Mela"…), giving the opposite order.
      await createProduct({ title: { it: 'Arancia', en: 'Orange' } })
      await createProduct({ title: { it: 'Mela', en: 'Apple' } })

      const response = await publicClient.get('/api/v1/public/loc_products?lang=en&orderBy=title&orderDir=asc')

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { title: string }[] }>()
      expect(body.data.map((d) => d.title)).toEqual(['Apple', 'Orange'])
    })

    it('a dictionary missing both the requested and default locale resolves to its first translation, in filters too', async () => {
      await createProduct({ title: { it: 'Scarpa' }, subtitle: { en: 'Walking shoe' } })

      const filter = encodeURIComponent(JSON.stringify({ where: [{ field: 'subtitle', op: 'eq', value: 'Walking shoe' }] }))
      const response = await publicClient.get(`/api/v1/public/loc_products?lang=it&filter=${filter}`)

      expect(response.status).toBe(200)
      const body = await response.json<{ meta: { total: number }; data: { id: string; subtitle: string }[] }>()
      expect(body.meta.total).toBe(1)
      expect(body.data[0].subtitle).toBe('Walking shoe')
    })

    it('a masked localized field shows the mask for the resolved translation', async () => {
      const id = await createProduct({ title: { it: 'Scarpa' }, tagline: { it: 'Ciao', en: 'Hi' } })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${id}&lang=en`)

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { tagline: string } }>()
      expect(body.data.tagline).toBe('••••••••')
    })

    it('?include resolves the related entry in the same language', async () => {
      const colorRes = await admin.post('/api/content/loc_colors', { name: { it: 'Rosso', en: 'Red' }, status: 'published' })
      expect(colorRes.status).toBe(201) // precondition
      const color = await colorRes.json<{ id: string }>()
      const productId = await createProduct({ title: { it: 'Scarpa' }, color_id: color.id })

      const response = await publicClient.get(`/api/v1/public/loc_products?id=${productId}&include=color_id&lang=en`)

      expect(response.status).toBe(200)
      const body = await response.json<{ data: { _includes: { color_id: { name: string } } } }>()
      expect(body.data._includes.color_id.name).toBe('Red')
    })

    it('a relation subquery filters the target through the negotiated language', async () => {
      const colorRes = await admin.post('/api/content/loc_colors', { name: { it: 'Rosso', en: 'Red' }, status: 'published' })
      expect(colorRes.status).toBe(201) // precondition
      const color = await colorRes.json<{ id: string }>()
      const productId = await createProduct({ title: { it: 'Scarpa' }, color_id: color.id })

      const filter = encodeURIComponent(JSON.stringify({
        where: [{ field: 'color_id', op: 'in', value: { where: [{ field: 'name', op: 'eq', value: 'Red' }] } }],
      }))
      const response = await publicClient.get(`/api/v1/public/loc_products?lang=en&filter=${filter}`)

      expect(response.status).toBe(200)
      const body = await response.json<{ meta: { total: number }; data: { id: string }[] }>()
      expect(body.meta.total).toBe(1)
      expect(body.data[0].id).toBe(productId)
    })

    it('a value written before the field was localized is returned and filtered as-is', async () => {
      const seedResponse = await admin.post('/api/seeds', {
        slug: 'loc_legacy',
        label: 'Legacy',
        displayNameAlias: 'title',
        allowPublicRead: true,
        branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } }],
      })
      expect(seedResponse.status).toBe(201) // precondition

      const entryResponse = await admin.post('/api/content/loc_legacy', { title: 'Legacy', slug: 'legacy', status: 'published' })
      expect(entryResponse.status).toBe(201) // precondition

      const existing = await (await admin.get('/api/seeds/loc_legacy')).json<{ definition: { branches: { alias: string; localized?: boolean }[] } }>()
      const toggled = await admin.put('/api/seeds/loc_legacy', {
        ...existing.definition,
        branches: existing.definition.branches.map((b) => (b.alias === 'title' ? { ...b, localized: true } : b)),
      })
      expect(toggled.status).toBe(200) // precondition

      const filter = encodeURIComponent(JSON.stringify({ where: [{ field: 'title', op: 'eq', value: 'Legacy' }] }))
      const response = await publicClient.get(`/api/v1/public/loc_legacy?lang=en&filter=${filter}`)

      expect(response.status).toBe(200)
      const body = await response.json<{ meta: { total: number }; data: { title: string }[] }>()
      expect(body.meta.total).toBe(1)
      expect(body.data[0].title).toBe('Legacy')
    })
  })
})

describe('public slice — reads of a project without localized fields (real D1)', () => {
  let plainHarness: TestHarness
  let plainPublicClient: TestClient

  beforeEach(async () => {
    // D1 storage is isolated per test file, not per test (see provision.ts), so the localized
    // seeds the tests above register stay in the `seeds` table. Remove them so the registry this
    // harness hydrates from D1 carries only the canonical, non-localized seeds.
    await env.DB.prepare(`DELETE FROM seeds WHERE slug IN ('loc_products', 'loc_colors', 'loc_legacy')`).run()
    __resetSeedRegistryCache()
    plainHarness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    plainPublicClient = plainHarness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLIC_READ_KEY })
  })

  it('ignores ?lang and adds no language headers when no field is localized', async () => {
    // Regression guard: a mono-lingual project must observe no difference (brief §4).
    const response = await plainPublicClient.get('/api/v1/public/posts?lang=en_US')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Language')).toBeNull()
    expect(response.headers.get('Vary')).not.toContain('Accept-Language')
  })
})
