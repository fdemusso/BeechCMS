// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public slice — localized writes integration tier. Covers POST .../add and PUT .../edit/:id
 * against real D1: a plain value is wrapped under the default locale (and slugged from it), and
 * an edit merges one translation into the stored dictionary without dropping the others.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, TEST_PUBLIC_WRITE_KEY, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../factory'
import { __resetSeedRegistryCache } from '../../../shared/services/cache/seed-registry-cache'

const publicLocSeed = defineSeed({
  slug: 'public_loc',
  label: 'Public Loc',
  displayNameAlias: 'title',
  allowPublicPost: true,
  allowPublicEdit: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true, policies: { public: true } },
  ],
})

describe('public slice — localized writes (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let publicClient: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [publicLocSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    publicClient = harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLIC_WRITE_KEY })
    // site_settings is a shared key-value table the harness never resets between tests.
    await harness.db.prepare('DELETE FROM site_settings').run()
    const configured = await admin.put('/api/settings', { locales: ['it', 'en'], defaultLocale: 'it' })
    if (configured.status !== 200) {
      throw new Error(`failed to configure locales: ${configured.status}`)
    }
  })

  it('POST /api/v1/public/:seed/add stores a plain value under the default locale and slugs from it', async () => {
    const response = await publicClient.post('/api/v1/public/public_loc/add', { title: 'Scarpa' })

    expect(response.status).toBe(201)
    const row = await harness.db.prepare(`SELECT title, slug FROM content_public_loc WHERE slug = ?`).bind('scarpa').first<{ title: string; slug: string }>()
    expect(row?.title).toBe('{"it":"Scarpa"}')
    expect(row?.slug).toBe('scarpa')
  })

  it('PUT /api/v1/public/:seed/edit/:id merges one translation and keeps the others', async () => {
    const created = await admin.post('/api/content/public_loc', { title: { it: 'Scarpa' }, slug: 'scarpa-edit' })
    expect(created.status).toBe(201) // precondition
    const { id } = await created.json<{ id: string }>()

    const response = await publicClient.put(`/api/v1/public/public_loc/edit/${id}`, { title: { en: 'Shoe' } })

    expect(response.status).toBe(200)
    const row = await harness.db.prepare(`SELECT title FROM content_public_loc WHERE id = ?`).bind(id).first<{ title: string }>()
    expect(JSON.parse(row?.title ?? 'null')).toEqual({ it: 'Scarpa', en: 'Shoe' })
  })

  it('POST /api/v1/public/:seed/add answers with the stored value in the negotiated language', async () => {
    const response = await publicClient.post(
      '/api/v1/public/public_loc/add',
      { title: { it: 'Scarpa', en: 'Shoe' } },
      { headers: { 'Accept-Language': 'en' } },
    )

    expect(response.status).toBe(201)
    const body = await response.json<{ id: string; data: { title: string } }>()
    expect(body.data.title).toBe('Shoe')
    const row = await harness.db.prepare(`SELECT title FROM content_public_loc WHERE id = ?`).bind(body.id).first<{ title: string }>()
    expect(JSON.parse(row?.title ?? 'null')).toEqual({ it: 'Scarpa', en: 'Shoe' })
  })

  it('POST /api/v1/public/:seed/add refuses a malformed ?lang and writes nothing', async () => {
    const response = await publicClient.post('/api/v1/public/public_loc/add?lang=en_US', { title: 'Scarpa' })

    expect(response.status).toBe(400)
    const body = await response.json<{ type: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/invalid-lang')
    const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_public_loc').first<{ n: number }>()
    expect(row?.n).toBe(0)
  })

  it('PUT /api/v1/public/:seed/edit/:id answers with the merged value in the negotiated language', async () => {
    const created = await admin.post('/api/content/public_loc', { title: { it: 'Scarpa' }, slug: 'scarpa-edit-lang' })
    expect(created.status).toBe(201) // precondition
    const { id } = await created.json<{ id: string }>()

    const response = await publicClient.put(`/api/v1/public/public_loc/edit/${id}?lang=en`, { title: { en: 'Shoe' } })

    expect(response.status).toBe(200)
    const body = await response.json<{ data: { title: string } }>()
    expect(body.data.title).toBe('Shoe')
    const row = await harness.db.prepare(`SELECT title FROM content_public_loc WHERE id = ?`).bind(id).first<{ title: string }>()
    expect(JSON.parse(row?.title ?? 'null')).toEqual({ it: 'Scarpa', en: 'Shoe' })
  })
})
