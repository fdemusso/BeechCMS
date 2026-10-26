// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Draft slice — low-severity bundle (#580) integration tier.
 * Covers the body `updated_at` OCC fallback on PUT /:slug/:id/draft, the `update` automation
 * dispatched when a draft goes live, and the activity-log rows written by publish and discard.
 * Real D1 plus the full middleware chain: the validator that used to reject `updated_at` runs
 * in front of the handler, which a handler-level unit test with mocks would never exercise.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import type { IAutomationRunner, IScheduler } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

type AutomationTrigger = Parameters<IAutomationRunner['run']>[0]

interface ActivityRow {
  action: string
  entity_id: string
  details: string | null
}

describe('draft slice — #580 bundle (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let triggers: AutomationTrigger[]

  beforeEach(async () => {
    __resetSeedRegistryCache()
    triggers = []
    const automationRunner: IAutomationRunner = {
      run: async (trigger) => {
        triggers.push(trigger)
      },
    }
    const scheduler: IScheduler = { waitUntil: () => {} }
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders, automationRunner, scheduler }),
    })
    admin = await harness.asUser('admin')
  })

  async function createPost(slug: string, title = 'Original'): Promise<string> {
    const created = await admin.post('/api/content/posts', { title, slug, status: 'published' })
    return (await created.json<{ id: string }>()).id
  }

  async function activityNotes(id: string): Promise<string[]> {
    const rows = await harness.db
      .prepare(`SELECT action, entity_id, details FROM activity_logs WHERE entity_id = ?`)
      .bind(id)
      .all<ActivityRow>()
    return rows.results.map((row) => (JSON.parse(row.details ?? '{}') as { note?: string }).note ?? '')
  }

  async function activityDetails(id: string, note: string): Promise<{ title?: string; note?: string }> {
    const rows = await harness.db
      .prepare(`SELECT details FROM activity_logs WHERE entity_id = ?`)
      .bind(id)
      .all<{ details: string | null }>()
    const parsed = rows.results.map((row) => JSON.parse(row.details ?? '{}') as { title?: string; note?: string })
    return parsed.find((details) => details.note === note) ?? {}
  }

  describe('PUT /:slug/:id/draft — body updated_at', () => {
    it('a stale body updated_at is honoured as the OCC guard instead of failing validation', async () => {
      const id = await createPost('bundle-occ-1')
      await admin.put(`/api/content/posts/${id}/draft`, { title: 'First draft' })

      const response = await admin.put(`/api/content/posts/${id}/draft`, { title: 'Second draft', updated_at: 1 })

      expect(response.status).toBe(409)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/draft-save-conflict')
    })

    it('a body updated_at never reaches the draft payload', async () => {
      const id = await createPost('bundle-occ-2')

      const response = await admin.put(`/api/content/posts/${id}/draft`, { title: 'Drafted', updated_at: 123 })

      expect(response.status).toBe(200)
      const draft = await admin.get(`/api/content/posts/${id}/draft`)
      const draftBody = await draft.json<{ data: { title: string } }>()
      expect(draftBody.data.title).toBe('Drafted')
    })
  })

  describe('POST /:slug/:id/draft/publish', () => {
    it('dispatches an update automation carrying the promoted live row', async () => {
      const id = await createPost('bundle-auto-1')
      await admin.put(`/api/content/posts/${id}/draft`, { title: 'Promoted title' })
      triggers.length = 0

      const response = await admin.post(`/api/content/posts/${id}/draft/publish`)

      expect(response.status).toBe(200)
      expect(triggers).toHaveLength(1)
      expect(triggers[0].seedSlug).toBe('posts')
      expect(triggers[0].event).toBe('update')
      expect(triggers[0].entry.id).toBe(id)
      expect(triggers[0].entry.title).toBe('Promoted title')
    })

    it('a publish that conflicts dispatches no automation', async () => {
      const id = await createPost('bundle-auto-2')
      await admin.put(`/api/content/posts/${id}/draft`, { title: 'Stale draft' })
      await harness.db
        .prepare(`UPDATE content_posts SET title = ?, updated_at = updated_at + 10 WHERE id = ?`)
        .bind('Other writer title', id)
        .run()
      triggers.length = 0

      const response = await admin.post(`/api/content/posts/${id}/draft/publish`)

      expect(response.status).toBe(409)
      expect(triggers).toHaveLength(0)
    })

    it('logs the resolved display name instead of the raw entry id', async () => {
      const id = await createPost('bundle-log-1')
      await admin.put(`/api/content/posts/${id}/draft`, { title: 'Promoted title' })

      await admin.post(`/api/content/posts/${id}/draft/publish`)

      const details = await activityDetails(id, 'draft published')
      expect(details.title).toBe('Promoted title')
    })
  })

  describe('DELETE /:slug/:id/draft', () => {
    it('writes a draft discarded activity row naming the entry', async () => {
      const id = await createPost('bundle-discard-1', 'Live title')
      await admin.put(`/api/content/posts/${id}/draft`, { title: 'Pending edit' })

      const response = await admin.delete(`/api/content/posts/${id}/draft`)

      expect(response.status).toBe(200)
      expect(await activityNotes(id)).toContain('draft discarded')
      const details = await activityDetails(id, 'draft discarded')
      expect(details.title).toBe('Live title')
    })
  })
})
