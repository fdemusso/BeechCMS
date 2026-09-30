// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — localization integration tier. Covers PUT .../draft and POST .../draft/publish
 * against real D1: a draft save merges into the pending draft (or live, when nothing is drafted
 * yet) rather than replacing it, and publish copies a complete dictionary onto the live row.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SLUG = 'loc_draft'

describe('draft slice — localization (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    // site_settings and seeds are shared tables the harness never resets between tests.
    await harness.db.prepare('DELETE FROM site_settings').run()
    await harness.db.prepare('DELETE FROM seeds WHERE slug = ?').bind(SLUG).run()

    const createdSeed = await admin.post('/api/seeds', {
      slug: SLUG,
      label: SLUG,
      allowDrafts: true,
      branches: [{ alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true }],
    })
    if (createdSeed.status !== 201) {
      throw new Error(`failed to provision seed '${SLUG}': ${createdSeed.status} ${JSON.stringify(await createdSeed.json())}`)
    }
    const configured = await admin.put('/api/settings', { locales: ['it', 'en', 'de', 'fr'], defaultLocale: 'it' })
    if (configured.status !== 200) {
      throw new Error(`failed to configure locales: ${configured.status}`)
    }
  })

  async function rawDraftTitle(entryId: string): Promise<unknown> {
    const row = await harness.db
      .prepare(`SELECT title FROM content_${SLUG}_drafts WHERE entry_id = ?`)
      .bind(entryId)
      .first<{ title: string | null }>()
    if (row?.title == null) return null
    try {
      return JSON.parse(row.title)
    } catch {
      return row.title
    }
  }

  async function rawLiveTitle(entrySlug: string): Promise<unknown> {
    const row = await harness.db
      .prepare(`SELECT title FROM content_${SLUG} WHERE slug = ?`)
      .bind(entrySlug)
      .first<{ title: string | null }>()
    if (row?.title == null) return null
    try {
      return JSON.parse(row.title)
    } catch {
      return row.title
    }
  }

  describe('PUT /api/content/:slug/:id/draft', () => {
    it('drafts a single translation on top of the live dictionary', async () => {
      const created = await admin.post(`/api/content/${SLUG}`, { title: { it: 'Scarpa' }, slug: 'scarpa', status: 'published' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const response = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { en: 'Shoe' } })

      expect(response.status).toBe(200)
      expect(await rawDraftTitle(id)).toEqual({ it: 'Scarpa', en: 'Shoe' })
      expect(await rawLiveTitle('scarpa')).toEqual({ it: 'Scarpa' })
    })

    it('builds on the pending draft rather than live for an already drafted field', async () => {
      const created = await admin.post(`/api/content/${SLUG}`, { title: { it: 'Scarpa' }, slug: 'scarpa2', status: 'published' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      const firstDraft = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { en: 'Shoe' } })
      expect(firstDraft.status).toBe(200) // precondition

      const response = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { it: 'Scarpetta' } })

      expect(response.status).toBe(200)
      expect(await rawDraftTitle(id)).toEqual({ it: 'Scarpetta', en: 'Shoe' })
    })

    it('a PUT carrying a stale If-Match on a localized merge answers 409 draft-save-conflict and leaves the concurrent write intact', async () => {
      const created = await admin.post(`/api/content/${SLUG}`, { title: { it: 'Scarpa' }, slug: 'scarpa5', status: 'published' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      // Translator B reads the draft here (it/en), capturing its version to merge against later.
      const firstDraft = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { en: 'Shoe' } })
      expect(firstDraft.status).toBe(200) // precondition
      const before = await harness.db
        .prepare(`SELECT updated_at FROM content_${SLUG}_drafts WHERE entry_id = ?`)
        .bind(id)
        .first<{ updated_at: number }>()

      // Translator A's save commits before B's PUT lands — the scenario the version guard exists
      // to catch. unixepoch() is second-granular, so force the "other writer" edit into a later second.
      await harness.db
        .prepare(`UPDATE content_${SLUG}_drafts SET title = ?, updated_at = updated_at + 10 WHERE entry_id = ?`)
        .bind(JSON.stringify({ it: 'Scarpa', en: 'Shoe', de: 'Schuh' }), id)
        .run()

      const response = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { fr: 'Chaussure' } }, {
        headers: { 'If-Match': String(before!.updated_at) },
      })

      expect(response.status).toBe(409)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/draft-save-conflict')
      // Translator A's "de" translation must survive — not be overwritten by B's stale merge.
      expect(await rawDraftTitle(id)).toEqual({ it: 'Scarpa', en: 'Shoe', de: 'Schuh' })
    })

    it('a PUT carrying the current If-Match value applies the localized merge', async () => {
      const created = await admin.post(`/api/content/${SLUG}`, { title: { it: 'Scarpa' }, slug: 'scarpa6', status: 'published' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      const firstDraft = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { en: 'Shoe' } })
      expect(firstDraft.status).toBe(200) // precondition
      const before = await harness.db
        .prepare(`SELECT updated_at FROM content_${SLUG}_drafts WHERE entry_id = ?`)
        .bind(id)
        .first<{ updated_at: number }>()

      const response = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { de: 'Schuh' } }, {
        headers: { 'If-Match': String(before!.updated_at) },
      })

      expect(response.status).toBe(200)
      expect(await rawDraftTitle(id)).toEqual({ it: 'Scarpa', en: 'Shoe', de: 'Schuh' })
    })
  })

  describe('POST /api/content/:slug/:id/draft/publish', () => {
    it('publishes a complete dictionary', async () => {
      const created = await admin.post(`/api/content/${SLUG}`, { title: { it: 'Scarpa' }, slug: 'scarpa3', status: 'published' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()
      const draft = await admin.put(`/api/content/${SLUG}/${id}/draft`, { title: { en: 'Shoe' } })
      expect(draft.status).toBe(200) // precondition

      const response = await admin.post(`/api/content/${SLUG}/${id}/draft/publish`)

      expect(response.status).toBe(200)
      expect(await rawLiveTitle('scarpa3')).toEqual({ it: 'Scarpa', en: 'Shoe' })
    })
  })

  describe('GET /api/content/drafts', () => {
    it('titles a pending draft of a localized display name in the default locale', async () => {
      const created = await admin.post(`/api/content/${SLUG}`, { title: { it: 'Bozza', en: 'Draft' }, slug: 'bozza', status: 'draft' })
      expect(created.status).toBe(201) // precondition
      const { id } = await created.json<{ id: string }>()

      const response = await admin.get('/api/content/drafts')

      expect(response.status).toBe(200)
      const body = await response.json<{ id: string; title: string }[]>()
      expect(body.find((draft) => draft.id === id)?.title).toBe('Bozza')
    })
  })
})
