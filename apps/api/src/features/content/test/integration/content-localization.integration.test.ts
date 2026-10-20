// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — localization integration tier. Covers the merge-on-write contract against
 * real D1: create wraps a plain value under the default locale, update merges into the stored
 * dictionary without dropping unmentioned or unregistered translations, and bulk edit refuses
 * localized fields outright. The concurrency guard itself is unit-proven
 * (apps/api/src/features/content/handlers/update.test.ts) — a race between the handler's read
 * and write cannot be staged through one HTTP request.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface SeedBranchBody {
  id: string
  alias: string
  type: string
  localized?: boolean
}

interface SeedRecordBody {
  slug: string
  definition: { branches: SeedBranchBody[] }
}

describe('content slice — localization (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // site_settings is a shared key-value table the harness never resets between tests.
    await harness.db.prepare('DELETE FROM site_settings').run()
  })

  async function provision(slug: string, branches: unknown[]): Promise<void> {
    const createdSeed = await admin.post('/api/seeds', { slug, label: slug, branches })
    if (createdSeed.status !== 201) {
      throw new Error(`failed to provision seed '${slug}': ${createdSeed.status} ${JSON.stringify(await createdSeed.json())}`)
    }
    const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
    if (configured.status !== 200) {
      throw new Error(`failed to configure locales: ${configured.status}`)
    }
  }

  async function rawTitle(slug: string, entrySlug: string): Promise<unknown> {
    const row = await harness.db
      .prepare(`SELECT title FROM content_${slug} WHERE slug = ?`)
      .bind(entrySlug)
      .first<{ title: string | null }>()
    if (row?.title == null) return null
    try {
      return JSON.parse(row.title)
    } catch {
      return row.title
    }
  }

  describe('POST /api/content/:slug', () => {
    it('wraps a plain value under the default locale', async () => {
      await provision('loc_content_wrap', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])

      const response = await admin.post('/api/content/loc_content_wrap', { title: 'Scarpa', slug: 'scarpa' })

      expect(response.status).toBe(201)
      const row = await harness.db
        .prepare(`SELECT title FROM content_loc_content_wrap WHERE slug = ?`)
        .bind('scarpa')
        .first<{ title: string }>()
      expect(row?.title).toBe('{"it":"Scarpa"}')
    })

    // Regression guard: String(dictionary) produced "object-object".
    it('derives the entry slug from the default-locale value', async () => {
      await provision('loc_content_slug', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])

      const response = await admin.post('/api/content/loc_content_slug', {
        title: { it: 'Scarpa Rossa', en: 'Red Shoe' },
      })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      const row = await harness.db
        .prepare(`SELECT slug FROM content_loc_content_slug WHERE id = ?`)
        .bind(id)
        .first<{ slug: string }>()
      expect(row?.slug).toBe('scarpa-rossa')
    })
  })

  describe('PUT /api/content/:slug/:id', () => {
    it('merges one translation and keeps the others', async () => {
      await provision('loc_content_merge', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])
      const created = await admin.post('/api/content/loc_content_merge', { title: { it: 'Scarpa' }, slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/loc_content_merge/${id}`, { title: { en: 'Shoe' } })

      expect(response.status).toBe(200)
      expect(await rawTitle('loc_content_merge', 'scarpa')).toEqual({ it: 'Scarpa', en: 'Shoe' })
    })

    it('replaces only the default locale when a plain value is sent', async () => {
      await provision('loc_content_plain', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])
      const created = await admin.post('/api/content/loc_content_plain', { title: { it: 'Scarpa', en: 'Shoe' }, slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/loc_content_plain/${id}`, { title: 'Scarpetta' })

      expect(response.status).toBe(200)
      expect(await rawTitle('loc_content_plain', 'scarpa')).toEqual({ it: 'Scarpetta', en: 'Shoe' })
    })

    it('clears one locale with a blank value', async () => {
      await provision('loc_content_clear', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])
      const created = await admin.post('/api/content/loc_content_clear', { title: { it: 'Scarpa', en: 'Shoe' }, slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/loc_content_clear/${id}`, { title: { en: '' } })

      expect(response.status).toBe(200)
      expect(await rawTitle('loc_content_clear', 'scarpa')).toEqual({ it: 'Scarpa' })
    })

    it('merges a legacy plain value written before the branch became localized', async () => {
      const slug = 'loc_content_legacy'
      const createdSeed = await admin.post('/api/seeds', {
        slug,
        label: slug,
        branches: [{ alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true }],
      })
      expect(createdSeed.status).toBe(201) // precondition
      const created = await admin.post(`/api/content/${slug}`, { title: 'Scarpa', slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
      expect(configured.status).toBe(200) // precondition
      const existing = await (await admin.get(`/api/seeds/${slug}`)).json<SeedRecordBody>()
      const toggled = await admin.put(`/api/seeds/${slug}`, {
        ...existing.definition,
        branches: existing.definition.branches.map((b) => (b.alias === 'title' ? { ...b, localized: true } : b)),
      })
      expect(toggled.status).toBe(200) // precondition

      const response = await admin.put(`/api/content/${slug}/${id}`, { title: { en: 'Shoe' } })

      expect(response.status).toBe(200)
      expect(await rawTitle(slug, 'scarpa')).toEqual({ it: 'Scarpa', en: 'Shoe' })
    })

    it('keeps a translation in a locale removed from settings', async () => {
      await provision('loc_content_removed', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])
      const created = await admin.post('/api/content/loc_content_removed', { title: { it: 'Scarpa', en: 'Shoe' }, slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      const settingsUpdate = await admin.put('/api/settings', { locales: ['it'] })
      expect(settingsUpdate.status).toBe(200) // precondition

      const response = await admin.put(`/api/content/loc_content_removed/${id}`, { title: 'Nuova' })

      expect(response.status).toBe(200)
      expect(await rawTitle('loc_content_removed', 'scarpa')).toEqual({ it: 'Nuova', en: 'Shoe' })
    })

    it('accepts a single-language save on a requiredOnUpdate branch', async () => {
      await provision('loc_content_required', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnUpdate: true }])
      const created = await admin.post('/api/content/loc_content_required', { title: { it: 'Scarpa' }, slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/loc_content_required/${id}`, { title: { en: 'Shoe' } })

      expect(response.status).toBe(200)
    })

    it('rejects a per-locale type error at alias.locale and leaves the row unchanged', async () => {
      await provision('loc_content_typeerror', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])
      const created = await admin.post('/api/content/loc_content_typeerror', { title: { it: 'Scarpa' }, slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      const before = await rawTitle('loc_content_typeerror', 'scarpa')

      const response = await admin.put(`/api/content/loc_content_typeerror/${id}`, { title: { en: 42 } })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string; errors: Array<{ field: string }> }>()
      expect(body.type).toContain('content-validation-failed')
      expect(body.errors).toContainEqual(expect.objectContaining({ field: 'title.en' }))
      expect(await rawTitle('loc_content_typeerror', 'scarpa')).toEqual(before)
    })
  })

  describe('PATCH /api/content/:slug/bulk', () => {
    it('refuses a localized field with 400 field-not-bulk-editable and writes nothing', async () => {
      await provision('loc_content_bulk', [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }])
      const created = await admin.post('/api/content/loc_content_bulk', { title: { it: 'Scarpa' }, slug: 'scarpa' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      const before = await rawTitle('loc_content_bulk', 'scarpa')

      const response = await admin.patch('/api/content/loc_content_bulk/bulk', { ids: [id], fields: { title: 'X' } })

      expect(response.status).toBe(400)
      const body = await response.json<{ type: string }>()
      expect(body.type).toContain('field-not-bulk-editable')
      expect(await rawTitle('loc_content_bulk', 'scarpa')).toEqual(before)
    })
  })
})
