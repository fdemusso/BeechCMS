// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Search slice — localized titles, integration tier. Covers `GET /api/search`: a match in any
 * language returns the result titled in the project's default locale, never raw JSON text.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const postsSeed = defineSeed({
  slug: 'loc_search_posts', label: 'Posts', displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true, policies: { search: true } },
  ],
})

describe('search slice — localized titles (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [postsSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // site_settings is a shared key-value table the harness never resets between tests.
    await harness.db.prepare('DELETE FROM site_settings').run()
    const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
    expect(configured.status).toBe(200) // precondition
  })

  describe('GET /api/search', () => {
    it('a match in any language returns the title in the default locale', async () => {
      const created = await admin.post('/api/content/loc_search_posts', {
        title: { it: 'Scarpa rossa', en: 'Red shoe' },
        status: 'published',
      })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const response = await admin.get('/api/search?q=shoe')

      expect(response.status).toBe(200)
      const body = await response.json<{ items: { id: string; title: string }[] }>()
      expect(body.items.find((item) => item.id === id)?.title).toBe('Scarpa rossa')
    })
  })
})
