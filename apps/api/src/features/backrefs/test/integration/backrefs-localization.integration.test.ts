// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Backrefs slice — localized display names, integration tier. Covers
 * `GET /api/content/:targetSlug/:targetId/backrefs` against real D1: a localized source display
 * name is listed in the project's default locale, and masking still applies after resolution.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const authorsSeed = defineSeed({
  slug: 'loc_br_authors', label: 'Author', displayNameAlias: 'name',
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text' }],
})
const booksSeed = defineSeed({
  slug: 'loc_br_books', label: 'Book', displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true },
    { id: 'br_02', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'loc_br_authors' },
  ],
})

describe('backrefs slice — localized display names (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [authorsSeed, booksSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // site_settings is a shared key-value table the harness never resets between tests.
    await harness.db.prepare('DELETE FROM site_settings').run()
    const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
    expect(configured.status).toBe(200) // precondition
  })

  it('a localized source display name is listed in the default locale', async () => {
    const authorResponse = await admin.post('/api/content/loc_br_authors', { name: 'Italo Calvino', status: 'published' })
    expect(authorResponse.status).toBe(201) // precondition
    const { id: authorId } = await authorResponse.json<{ id: string }>()
    const bookResponse = await admin.post('/api/content/loc_br_books', {
      title: { it: 'Il libro', en: 'The book' },
      author_id: authorId,
      status: 'published',
    })
    expect(bookResponse.status).toBe(201) // precondition

    const response = await admin.get(`/api/content/loc_br_authors/${authorId}/backrefs`)

    expect(response.status).toBe(200)
    const body = await response.json<{ groups: { items: { displayName: string | null }[] }[] }>()
    expect(body.groups[0]?.items[0]?.displayName).toBe('Il libro')
  })
})
