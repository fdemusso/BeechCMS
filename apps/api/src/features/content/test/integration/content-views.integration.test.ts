// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — view instances, integration tier.
 * Covers the `/views` surface against real D1 through the full middleware chain.
 * Config cleanup rules are unit-tested in `packages/core/src/dashboard-layout/content-view.test.ts`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

type ViewBody = {
  id: string
  type: string
  title: string | null
  position: number
  config: { filters: Array<{ columnRef: string }>; kanban?: unknown }
}

describe('content slice — views (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  describe('GET /api/content/:slug/views', () => {
    it('bootstraps one untitled instance per authorized type on a seed with no views', async () => {
      const response = await admin.get('/api/content/posts/views')

      expect(response.status).toBe(200)
      const views = await response.json<ViewBody[]>()
      expect(views.map((view) => view.type)).toEqual(['table', 'gallery'])
      expect(views.map((view) => view.title)).toEqual([null, null])
      expect(views.map((view) => view.position)).toEqual([0, 1])
      for (const view of views) expect(view.id).toMatch(UUID_V4_PATTERN)

      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = ?').bind('posts').first<{ n: number }>()
      expect(row?.n).toBe(2)
    })

    it('returns the bootstrapped instances on a second read instead of creating more', async () => {
      const first = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()

      const response = await admin.get('/api/content/posts/views')

      expect(response.status).toBe(200)
      const second = await response.json<ViewBody[]>()
      expect(second.map((view) => view.id)).toEqual(first.map((view) => view.id))

      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = ?').bind('posts').first<{ n: number }>()
      expect(row?.n).toBe(2)
    })

    it('hides an instance whose type the seed does not authorize and keeps its row', async () => {
      await admin.get('/api/content/posts/views')
      // The posts seed authorizes only table|gallery; a direct insert simulates a stale kanban
      // row left over from before the seed's dashboard.views allow-list was narrowed.
      await harness.db
        .prepare(`INSERT INTO seed_views (id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by)
                  VALUES ('00000000-0000-4000-8000-000000000001', 'posts', 'kanban', NULL, 2, '{}', 0, 0, 'admin')`)
        .run()

      const response = await admin.get('/api/content/posts/views')

      expect(response.status).toBe(200)
      const views = await response.json<ViewBody[]>()
      expect(views.map((view) => view.type)).not.toContain('kanban')

      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = ?').bind('posts').first<{ n: number }>()
      expect(row?.n).toBe(3)
    })

    it('returns a stored config without references to branches the seed no longer has', async () => {
      const [tableView] = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      const staleConfig = JSON.stringify({
        filters: [
          { columnRef: 'br_05', conditions: [{ op: 'eq', value: 'x' }] },
          { columnRef: 'br_99', conditions: [{ op: 'eq', value: 'y' }] },
        ],
      })
      await harness.db.prepare('UPDATE seed_views SET config = ? WHERE id = ?').bind(staleConfig, tableView.id).run()

      const response = await admin.get('/api/content/posts/views')

      const views = await response.json<ViewBody[]>()
      const updatedTableView = views.find((view) => view.id === tableView.id)
      expect(updatedTableView?.config.filters).toMatchObject([{ columnRef: 'br_05' }])
    })
  })

  describe('POST /api/content/:slug/views', () => {
    it('appends an authorized instance with a trimmed title and a cleaned config', async () => {
      const response = await admin.post('/api/content/posts/views', {
        type: 'gallery',
        title: '  Covers ',
        config: {
          filters: [
            { columnRef: 'br_05', conditions: [{ op: 'gt', value: 10 }] },
            { columnRef: 'br_99', conditions: [{ op: 'eq', value: 'x' }] },
          ],
        },
      })

      expect(response.status).toBe(201)
      const view = await response.json<ViewBody>()
      expect(view.title).toBe('Covers')
      expect(view.position).toBe(2)
      expect(view.config.filters).toHaveLength(1)

      const row = await harness.db.prepare('SELECT config FROM seed_views WHERE id = ?').bind(view.id).first<{ config: string }>()
      expect(JSON.parse(row?.config ?? '{}').filters).toHaveLength(1)
    })

    it('refuses a type the seed does not authorize and stores no instance of it', async () => {
      const response = await admin.post('/api/content/posts/views', { type: 'kanban' })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-view-type-not-authorized')

      const row = await harness.db.prepare("SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = 'posts' AND view_type = 'kanban'").first<{ n: number }>()
      expect(row?.n).toBe(0)
    })

    it('refuses a reserved view type that has no implementation', async () => {
      const response = await admin.post('/api/content/posts/views', { type: 'calendar' })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-invalid-view')

      // Validation runs before bootstrap, so a malformed POST never materialises default rows.
      const row = await harness.db.prepare("SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = 'posts'").first<{ n: number }>()
      expect(row?.n).toBe(0)
    })

    it('bootstraps the defaults before the first create so the seed keeps a Table instance', async () => {
      const response = await admin.post('/api/content/posts/views', { type: 'gallery' })

      expect(response.status).toBe(201)
      const row = await harness.db.prepare("SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = 'posts' AND view_type = 'table'").first<{ n: number }>()
      expect(row?.n).toBe(1)
    })

    it('refuses a user without content:update and stores nothing', async () => {
      const viewer = await harness.asUser('viewer')

      const response = await viewer.post('/api/content/posts/views', { type: 'gallery' })

      expect(response.status).toBe(403)
      const row = await harness.db.prepare("SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = 'posts'").first<{ n: number }>()
      expect(row?.n).toBe(0)
    })
  })

  describe('PATCH /api/content/:slug/views/:viewId', () => {
    it('renames an instance and leaves its config untouched', async () => {
      const [tableView] = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      await admin.patch(`/api/content/posts/views/${tableView.id}`, {
        config: { filters: [{ columnRef: 'br_01', conditions: [{ op: 'eq', value: 'x' }] }] },
      })

      const response = await admin.patch(`/api/content/posts/views/${tableView.id}`, { title: 'Mine' })

      expect(response.status).toBe(200)
      const view = await response.json<ViewBody>()
      expect(view.title).toBe('Mine')
      expect(view.config.filters).toEqual([{ columnRef: 'br_01', conditions: [{ op: 'eq', value: 'x' }] }])
    })

    it('drops the kanban sub-config from a non-kanban instance', async () => {
      const [tableView] = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()

      const response = await admin.patch(`/api/content/posts/views/${tableView.id}`, {
        config: { kanban: { axisBranchId: null, sort: null } },
      })

      expect(response.status).toBe(200)
      const view = await response.json<ViewBody>()
      expect(view.config.kanban).toBeUndefined()

      const row = await harness.db.prepare('SELECT config FROM seed_views WHERE id = ?').bind(tableView.id).first<{ config: string }>()
      expect(JSON.parse(row?.config ?? '{}').kanban).toBeUndefined()
    })

    it('answers 404 content-view-not-found for an id the seed does not own', async () => {
      await admin.get('/api/content/posts/views')
      // Literal UUID, not crypto.randomUUID() (Rule 7.7): the test only needs a well-formed id
      // that owns no row, not a fresh random one.
      const response = await admin.patch('/api/content/posts/views/00000000-0000-4000-8000-000000000000', { title: 'X' })

      expect(response.status).toBe(404)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-view-not-found')

      const row = await harness.db.prepare("SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = 'posts'").first<{ n: number }>()
      expect(row?.n).toBe(2)
    })
  })

  describe('DELETE /api/content/:slug/views/:viewId', () => {
    it('deletes a non-table instance', async () => {
      const views = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      const gallery = views.find((view) => view.type === 'gallery')!

      const response = await admin.delete(`/api/content/posts/views/${gallery.id}`)

      expect(response.status).toBe(204)
      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_views WHERE id = ?').bind(gallery.id).first<{ n: number }>()
      expect(row?.n).toBe(0)
    })

    // Regression guard: Table is the universal fallback (brief §2) and must survive any delete.
    it('refuses to delete the only Table instance with 409 content-view-last-table', async () => {
      const views = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      const table = views.find((view) => view.type === 'table')!

      const response = await admin.delete(`/api/content/posts/views/${table.id}`)

      expect(response.status).toBe(409)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-view-last-table')

      const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM seed_views WHERE id = ?').bind(table.id).first<{ n: number }>()
      expect(row?.n).toBe(1)
    })

    it('deletes a Table instance when another Table instance exists', async () => {
      const views = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      const firstTable = views.find((view) => view.type === 'table')!
      const secondTable = await (await admin.post('/api/content/posts/views', { type: 'table' })).json<ViewBody>()

      const response = await admin.delete(`/api/content/posts/views/${secondTable.id}`)

      expect(response.status).toBe(204)
      const row = await harness.db.prepare("SELECT COUNT(*) AS n FROM seed_views WHERE seed_slug = 'posts' AND view_type = 'table'").first<{ n: number }>()
      expect(row?.n).toBe(1)
      const remaining = await harness.db.prepare('SELECT id FROM seed_views WHERE seed_slug = ? AND view_type = ?').bind('posts', 'table').first<{ id: string }>()
      expect(remaining?.id).toBe(firstTable.id)
    })
  })

  describe('PUT /api/content/:slug/views/order', () => {
    it('rewrites positions to the requested order', async () => {
      const views = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      const table = views.find((view) => view.type === 'table')!
      const gallery = views.find((view) => view.type === 'gallery')!

      const response = await admin.put('/api/content/posts/views/order', { ids: [gallery.id, table.id] })

      expect(response.status).toBe(200)
      const ordered = await response.json<ViewBody[]>()
      expect(ordered.map((view) => view.id)).toEqual([gallery.id, table.id])

      const galleryRow = await harness.db.prepare('SELECT position FROM seed_views WHERE id = ?').bind(gallery.id).first<{ position: number }>()
      const tableRow = await harness.db.prepare('SELECT position FROM seed_views WHERE id = ?').bind(table.id).first<{ position: number }>()
      expect(galleryRow?.position).toBe(0)
      expect(tableRow?.position).toBe(1)
    })

    it('refuses an order that omits a visible instance and keeps every position', async () => {
      const views = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      const table = views.find((view) => view.type === 'table')!
      const gallery = views.find((view) => view.type === 'gallery')!

      const response = await admin.put('/api/content/posts/views/order', { ids: [table.id] })

      expect(response.status).toBe(422)
      const body = await response.json<{ type: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/content-view-order-mismatch')

      const tableRow = await harness.db.prepare('SELECT position FROM seed_views WHERE id = ?').bind(table.id).first<{ position: number }>()
      const galleryRow = await harness.db.prepare('SELECT position FROM seed_views WHERE id = ?').bind(gallery.id).first<{ position: number }>()
      expect(tableRow?.position).toBe(0)
      expect(galleryRow?.position).toBe(1)
    })

    it('keeps a hidden instance in its slot and gives every row a distinct position after a reorder', async () => {
      const views = await (await admin.get('/api/content/posts/views')).json<ViewBody[]>()
      const table = views.find((view) => view.type === 'table')!
      const gallery1 = views.find((view) => view.type === 'gallery')!
      // The posts seed authorizes only table|gallery; a direct insert simulates a stale kanban
      // row left over from before the seed's dashboard.views allow-list was narrowed.
      await harness.db
        .prepare(`INSERT INTO seed_views (id, seed_slug, view_type, title, position, config, created_at, updated_at, updated_by)
                  VALUES ('00000000-0000-4000-8000-000000000002', 'posts', 'kanban', NULL, 2, '{}', 0, 0, 'admin')`)
        .run()
      const gallery2 = await (await admin.post('/api/content/posts/views', { type: 'gallery' })).json<ViewBody>()

      const response = await admin.put('/api/content/posts/views/order', { ids: [gallery2.id, gallery1.id, table.id] })

      expect(response.status).toBe(200)
      const ordered = await response.json<ViewBody[]>()
      expect(ordered.map((view) => view.id)).toEqual([gallery2.id, gallery1.id, table.id])

      const rows = await harness.db
        .prepare('SELECT id, position FROM seed_views WHERE seed_slug = ? ORDER BY position')
        .bind('posts')
        .all<{ id: string; position: number }>()
      expect(rows.results.map((row) => row.id)).toEqual([
        gallery2.id,
        gallery1.id,
        '00000000-0000-4000-8000-000000000002',
        table.id,
      ])
      const distinctPositions = await harness.db
        .prepare("SELECT COUNT(DISTINCT position) AS n FROM seed_views WHERE seed_slug = 'posts'")
        .first<{ n: number }>()
      expect(distinctPositions?.n).toBe(4)
    })
  })
})
