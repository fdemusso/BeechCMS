// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Stats slice — scope isolation, integration tier.
 * Proves a caller holding `content:read` on one seed plus `view_analytics` sees nothing of other seeds
 * through the stats routes, against real D1 and the full middleware chain.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface ActivityItem {
  id: string
  user_email: string
  entity_slug: string | null
  details: unknown
}

interface TotalStats {
  total: number
  today: number
  week: number
  month: number
}

interface BreakdownItem {
  slug: string
  label: string
  count: number
}

const STATS = '/api/content/stats'
const SECONDS_PER_HOUR = 60 * 60

describe('stats slice — scope isolation (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let viewer: TestClient

  async function logActivity(id: string, entityType: string, entitySlug: string | null, createdAt: number): Promise<void> {
    await harness.db
      .prepare(
        `INSERT INTO activity_logs (id, user_id, user_email, action, entity_type, entity_id, entity_slug, details, created_at)
         VALUES (?, ?, ?, 'create', ?, ?, ?, ?, ?)`,
      )
      .bind(id, CANONICAL_USERS.admin.id, CANONICAL_USERS.admin.email, entityType, `entry-${id}`, entitySlug, JSON.stringify({ title: id }), createdAt)
      .run()
  }

  async function assignViewer(assignmentId: string, roleId: string, scope: string): Promise<void> {
    await harness.db
      .prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)')
      .bind(assignmentId, CANONICAL_USERS.viewer.id, roleId, scope)
      .run()
  }

  async function createEntry(slug: 'posts' | 'authors', body: Record<string, unknown>): Promise<string> {
    const response = await admin.post(`/api/content/${slug}`, { status: 'published', ...body })
    expect(response.status).toBe(201)
    return (await response.json<{ id: string }>()).id
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    viewer = await harness.asUser('viewer')
    await harness.db.prepare('DELETE FROM activity_logs').run()
    await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.viewer.id).run()
    await harness.db.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES ('stats-seed-reader', 'Stats Seed Reader')").run()
    await harness.db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES ('stats-seed-reader', 'content:read')").run()
    await harness.db.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES ('stats-analytics', 'Stats Analytics')").run()
    await harness.db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES ('stats-analytics', 'view_analytics')").run()
    // The role assignment repository decay-filters scopes against the D1 `seeds` table, so the
    // `posts` scope below only resolves because the harness provisions the canonical seeds there.
    await assignViewer('stats-viewer-posts', 'stats-seed-reader', 'posts')
    await assignViewer('stats-viewer-analytics', 'stats-analytics', '*')
  })

  describe(`GET ${STATS}/total`, () => {
    it('counts only the entries of seeds the caller reads', async () => {
      const authorId = await createEntry('authors', { name: 'First Author' })
      await createEntry('authors', { name: 'Second Author' })
      await createEntry('posts', { title: 'Only Post', author_id: authorId })
      const adminResponse = await admin.get(`${STATS}/total`)
      expect((await adminResponse.json<TotalStats>()).total).toBe(3)

      const response = await viewer.get(`${STATS}/total`)

      expect(response.status).toBe(200)
      const body = await response.json<TotalStats>()
      expect(body.total).toBe(1)
    })

    it('counts only create events of readable seeds inside each window', async () => {
      const now = harness.clock.nowSeconds()
      const recent = now - SECONDS_PER_HOUR
      await logActivity('p1', 'content', 'posts', recent)
      await logActivity('p2', 'content', 'posts', recent)
      await logActivity('a1', 'content', 'authors', recent)
      await logActivity('a2', 'content', 'authors', recent)
      await logActivity('a3', 'content', 'authors', recent)

      const response = await viewer.get(`${STATS}/total`)

      expect(response.status).toBe(200)
      const body = await response.json<TotalStats>()
      expect(body).toMatchObject({ today: 2, week: 2, month: 2 })
    })
  })

  describe(`GET ${STATS}/breakdown`, () => {
    it('lists only readable seeds, with no label or count of the others', async () => {
      const authorId = await createEntry('authors', { name: 'Hidden Author' })
      await createEntry('posts', { title: 'Visible Post', author_id: authorId })

      const response = await viewer.get(`${STATS}/breakdown`)

      expect(response.status).toBe(200)
      const body = await response.json<BreakdownItem[]>()
      expect(body).toEqual([expect.objectContaining({ slug: 'posts', count: 1 })])
    })
  })

  describe(`GET ${STATS}/recent-activity`, () => {
    it('omits rows of unreadable seeds, including their user email and details', async () => {
      const now = harness.clock.nowSeconds()
      await logActivity('own-post', 'content', 'posts', now - 20)
      await logActivity('hidden-author', 'content', 'authors', now - 10)

      const response = await viewer.get(`${STATS}/recent-activity`)

      expect(response.status).toBe(200)
      const body = await response.json<ActivityItem[]>()
      expect(body.map(item => item.entity_slug)).toEqual(['posts'])
      expect(JSON.stringify(body)).not.toContain('hidden-author')
    })

    it('hides rows tied to no seed from a caller without global manage_users', async () => {
      const now = harness.clock.nowSeconds()
      await logActivity('own-post', 'content', 'posts', now - 20)
      await logActivity('upload', 'media', null, now - 10)
      const adminResponse = await admin.get(`${STATS}/recent-activity`)
      expect((await adminResponse.json<ActivityItem[]>()).map(item => item.id)).toContain('upload')

      const response = await viewer.get(`${STATS}/recent-activity`)

      expect(response.status).toBe(200)
      const body = await response.json<ActivityItem[]>()
      expect(body.map(item => item.id)).toEqual(['own-post'])
    })

    it('keeps a global reader without manage_users away from unscoped rows', async () => {
      const now = harness.clock.nowSeconds()
      await harness.db.prepare("DELETE FROM user_role_assignments WHERE id = 'stats-viewer-posts'").run()
      await assignViewer('stats-viewer-global-read', 'stats-seed-reader', '*')
      await logActivity('own-post', 'content', 'posts', now - 30)
      await logActivity('other-author', 'content', 'authors', now - 20)
      await logActivity('upload', 'media', null, now - 10)

      const response = await viewer.get(`${STATS}/recent-activity`)

      expect(response.status).toBe(200)
      const body = await response.json<ActivityItem[]>()
      expect(body.map(item => item.id).sort()).toEqual(['other-author', 'own-post'])
    })

    it('answers 200 with an empty list for a slug outside the perimeter, never 403', async () => {
      const now = harness.clock.nowSeconds()
      await logActivity('hidden-author', 'content', 'authors', now - 10)

      const response = await viewer.get(`${STATS}/recent-activity?slug=authors`)

      // A 403 here would confirm the slug exists, so the unreadable slug looks like an empty one.
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual([])
    })

    it('fills the 15-row limit from visible rows only', async () => {
      const now = harness.clock.nowSeconds()
      await logActivity('old-post', 'content', 'posts', now - 1000)
      for (let index = 0; index < 15; index += 1) {
        await logActivity(`newer-author-${index}`, 'content', 'authors', now - index)
      }

      const response = await viewer.get(`${STATS}/recent-activity`)

      // Regression guard: filtering after LIMIT 15 would return an empty feed here.
      expect(response.status).toBe(200)
      const body = await response.json<ActivityItem[]>()
      expect(body.map(item => item.id)).toEqual(['old-post'])
    })
  })

  describe('caller with no assignment', () => {
    it('gets 200 with zeros and empty lists from total, breakdown and recent-activity', async () => {
      const editor = await harness.asUser('editor')
      await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.editor.id).run()
      await logActivity('own-post', 'content', 'posts', harness.clock.nowSeconds() - 10)
      const expectedBodies = [
        { path: `${STATS}/total`, body: { total: 0, today: 0, week: 0, month: 0 } },
        { path: `${STATS}/breakdown`, body: [] },
        { path: `${STATS}/recent-activity`, body: [] },
      ]

      const responses = await Promise.all(expectedBodies.map(({ path }) => editor.get(path)))

      for (const [index, response] of responses.entries()) {
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(expectedBodies[index].body)
      }
    })
  })

  describe('routes that need a global grant', () => {
    it('media-library and unused-media refuse a seed-scoped reader with 403 forbidden', async () => {
      const paths = [`${STATS}/media-library`, `${STATS}/unused-media`]

      // Media belongs to no seed, so one seed-scoped grant is not enough, unlike `total` which answers 200.
      for (const path of paths) {
        const response = await viewer.get(path)
        expect(response.status).toBe(403)
        expect((await response.json<{ error: string }>()).error).toBe('forbidden')
      }
    })

    it('media-library serves a global content:read holder without view_analytics', async () => {
      await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.viewer.id).run()
      await assignViewer('stats-viewer-global-read', 'stats-seed-reader', '*')

      const response = await viewer.get(`${STATS}/media-library`)

      expect(response.status).toBe(200)
      const body = await response.json<{ items: unknown[]; total: number }>()
      expect(body.items).toEqual([])
    })

    it('setup-checklist refuses viewer with 403 forbidden', async () => {
      // The checklist exposes the first seed slug, so it needs manage_users@*; `total` has no such gate.
      const response = await viewer.get(`${STATS}/setup-checklist`)

      expect(response.status).toBe(403)
      expect((await response.json<{ error: string }>()).error).toBe('forbidden')
    })

    it('setup-checklist serves admin with 200', async () => {
      const response = await admin.get(`${STATS}/setup-checklist`)

      expect(response.status).toBe(200)
    })

    it('health and cloudflare serve a view_analytics holder with 200', async () => {
      const paths = [`${STATS}/health`, `${STATS}/cloudflare`]

      for (const path of paths) {
        expect((await viewer.get(path)).status).toBe(200)
      }
    })

    it('health and cloudflare refuse an account holding only content:read on one seed with 403', async () => {
      const editor = await harness.asUser('editor')
      await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.editor.id).run()
      await harness.db
        .prepare("INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES ('stats-editor-posts', ?, 'stats-seed-reader', 'posts')")
        .bind(CANONICAL_USERS.editor.id)
        .run()
      const paths = [`${STATS}/health`, `${STATS}/cloudflare`]

      for (const path of paths) {
        expect((await editor.get(path)).status).toBe(403)
      }
    })
  })
})
