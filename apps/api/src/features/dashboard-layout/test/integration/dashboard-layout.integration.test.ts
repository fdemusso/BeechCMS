// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Dashboard-layout slice — integration tier.
 * Covers the single `default` layout, the server-side audience projection, the `manage_roles@*` write gate
 * and the interim `layout-locked` guard, against real D1 and the full middleware chain.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import {
  DEFAULT_DASHBOARD_SCOPE,
  MAX_DASHBOARD_LAYOUT_BYTES,
  MAX_WIDGET_CONFIG_BYTES,
  type DashboardLayout,
  type DashboardPageLayout,
  type DashboardWidgetInstance,
} from '@beechcms/core'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

interface LayoutBody {
  layout: DashboardLayout | null
}

interface SaveBody {
  ok: boolean
  layout: DashboardLayout
  warnings: string[]
}

interface ProblemBody {
  type: string
  detail: string
}

interface GateBody {
  error: string
}

interface RoleItem {
  id: string
  name: string
  icon: string | null
}

const LAYOUT = '/api/dashboard-layout'
const PROBLEM_BASE = 'https://beechcms.dev/problems/'

const ROLE_READER = 'a1b2c3d4-0001-4a1b-8c2d-3e4f5a6b7c01'
const ROLE_AUDIENCE = 'a1b2c3d4-0002-4a1b-8c2d-3e4f5a6b7c02'
const ROLE_ROLE_MANAGER = 'a1b2c3d4-0003-4a1b-8c2d-3e4f5a6b7c03'
const ROLE_USER_MANAGER = 'a1b2c3d4-0004-4a1b-8c2d-3e4f5a6b7c04'

function widgetOn(id: string, seedSlug?: string): DashboardWidgetInstance {
  return { id, type: 'core/recent-content', config: seedSlug ? { seedSlug } : {} }
}

function tab(slug: string, widgets: DashboardWidgetInstance[], roles?: string[]): DashboardPageLayout {
  return {
    id: `page-${slug}`,
    slug,
    label: slug,
    ...(roles ? { roles } : {}),
    sections: [{ id: `section-${slug}`, columns: [{ id: `col-${slug}`, widgets }] }],
  }
}

function layoutWith(...pages: DashboardPageLayout[]): DashboardLayout {
  return { version: 1, pages }
}

describe('dashboard-layout slice — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let viewer: TestClient

  async function assignViewer(assignmentId: string, roleId: string, scope: string): Promise<void> {
    await harness.db
      .prepare('INSERT INTO user_role_assignments (id, user_id, role_id, scope) VALUES (?, ?, ?, ?)')
      .bind(assignmentId, CANONICAL_USERS.viewer.id, roleId, scope)
      .run()
  }

  async function insertRole(id: string, name: string, permissions: string[]): Promise<void> {
    await harness.db.prepare('INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)').bind(id, name).run()
    for (const permission of permissions) {
      await harness.db
        .prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)')
        .bind(id, permission)
        .run()
    }
  }

  async function storedRowCount(): Promise<number> {
    const row = await harness.db
      .prepare('SELECT COUNT(*) AS n FROM dashboard_layouts WHERE scope = ?')
      .bind(DEFAULT_DASHBOARD_SCOPE)
      .first<{ n: number }>()
    return row?.n ?? -1
  }

  async function storedLayoutJson(): Promise<string | null> {
    const row = await harness.db
      .prepare('SELECT layout FROM dashboard_layouts WHERE scope = ?')
      .bind(DEFAULT_DASHBOARD_SCOPE)
      .first<{ layout: string }>()
    return row?.layout ?? null
  }

  async function storeAsAdmin(layout: DashboardLayout): Promise<void> {
    const response = await admin.put(LAYOUT, layout)
    expect(response.status).toBe(200)
  }

  /** Replaces the viewer's baseline `content:read@posts` with global `manage_roles` and no content read. */
  async function makeViewerRoleManagerWithoutContentRead(): Promise<void> {
    await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.viewer.id).run()
    await assignViewer('layout-viewer-role-manager', ROLE_ROLE_MANAGER, '*')
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    viewer = await harness.asUser('viewer')
    await harness.db.prepare('DELETE FROM dashboard_layouts').run()
    await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.viewer.id).run()
    await insertRole(ROLE_READER, 'layout-reader', ['content:read'])
    await insertRole(ROLE_AUDIENCE, 'layout-audience', [])
    await insertRole(ROLE_ROLE_MANAGER, 'layout-role-manager', ['manage_roles'])
    await insertRole(ROLE_USER_MANAGER, 'layout-user-manager', ['manage_users'])
    // The role assignment repository decay-filters scopes against the D1 `seeds` table, so the
    // `posts` scope below only resolves because the harness provisions the canonical seeds there.
    await assignViewer('layout-viewer-reader', ROLE_READER, 'posts')
  })

  describe(`GET ${LAYOUT}`, () => {
    it('returns 200 { layout: null } with Cache-Control no-store when nothing is stored', async () => {
      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const body = await response.json<LayoutBody>()
      expect(body).toEqual({ layout: null })
    })

    it('ignores a legacy role:editor row, answering { layout: null } to viewer and admin', async () => {
      await harness.db
        .prepare('INSERT INTO dashboard_layouts (scope, layout, updated_by) VALUES (?, ?, ?)')
        .bind('role:editor', JSON.stringify(layoutWith(tab('legacy', [widgetOn('w-legacy')]))), 'legacy-user')
        .run()

      const viewerResponse = await viewer.get(LAYOUT)
      const adminResponse = await admin.get(LAYOUT)

      expect(viewerResponse.status).toBe(200)
      expect(await viewerResponse.json<LayoutBody>()).toEqual({ layout: null })
      expect(adminResponse.status).toBe(200)
      expect(await adminResponse.json<LayoutBody>()).toEqual({ layout: null })
    })

    it('omits a tab targeted at layout-audience for a viewer who does not hold that role', async () => {
      await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')]), tab('team', [widgetOn('w-team')], [ROLE_AUDIENCE])))

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const body = await response.json<LayoutBody>()
      expect(body.layout?.pages.map(page => page.slug)).toEqual(['open'])
    })

    it('serves a tab targeted at layout-audience once the viewer is also assigned that role', async () => {
      await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')]), tab('team', [widgetOn('w-team')], [ROLE_AUDIENCE])))
      await assignViewer('layout-viewer-audience', ROLE_AUDIENCE, 'posts')

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const body = await response.json<LayoutBody>()
      expect(body.layout?.pages.map(page => page.slug)).toEqual(['open', 'team'])
    })

    it('serves the posts widget but not the authors widget of a shared tab, leaking no authors substring', async () => {
      await storeAsAdmin(layoutWith(tab('shared', [widgetOn('w-posts', 'posts'), widgetOn('w-authors', 'authors')])))

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).not.toContain('authors')
      const body = JSON.parse(text) as LayoutBody
      expect(body.layout?.pages[0].sections[0].columns[0].widgets.map(widget => widget.id)).toEqual(['w-posts'])
    })

    it('drops for the viewer a tab whose every widget is bound to authors', async () => {
      await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')]), tab('authors-only', [widgetOn('w-authors', 'authors')])))

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const body = await response.json<LayoutBody>()
      expect(body.layout?.pages.map(page => page.slug)).toEqual(['open'])
    })

    it('serves admin every tab with roles intact, including a tab targeted at a role admin does not hold', async () => {
      await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')]), tab('team', [widgetOn('w-team')], [ROLE_AUDIENCE])))

      const response = await admin.get(LAYOUT)

      expect(response.status).toBe(200)
      const body = await response.json<LayoutBody>()
      expect(body.layout?.pages.map(page => page.slug)).toEqual(['open', 'team'])
      expect(body.layout?.pages[1].roles).toEqual([ROLE_AUDIENCE])
    })

    it('serves a tab to the viewer with no roles key', async () => {
      await storeAsAdmin(layoutWith(tab('team', [widgetOn('w-team')], [ROLE_AUDIENCE])))
      await assignViewer('layout-viewer-audience', ROLE_AUDIENCE, 'posts')

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const body = await response.json<LayoutBody>()
      expect(body.layout?.pages).toHaveLength(1)
      expect(Object.keys(body.layout?.pages[0] ?? {})).not.toContain('roles')
    })
  })

  describe(`PUT ${LAYOUT}`, () => {
    it('persists a tab naming a known role id, and admin reads it back with that roles array', async () => {
      const layout = layoutWith(tab('team', [widgetOn('w-team')], [ROLE_AUDIENCE]))

      const response = await admin.put(LAYOUT, layout)

      expect(response.status).toBe(200)
      expect((await response.json<SaveBody>()).ok).toBe(true)
      const readBack = await (await admin.get(LAYOUT)).json<LayoutBody>()
      expect(readBack.layout?.pages[0].roles).toEqual([ROLE_AUDIENCE])
      expect(await storedRowCount()).toBe(1)
    })

    it('answers 422 invalid-layout for an unknown role id and persists nothing', async () => {
      const layout = layoutWith(tab('team', [widgetOn('w-team')], ['a1b2c3d4-ffff-4a1b-8c2d-3e4f5a6b7cff']))

      const response = await admin.put(LAYOUT, layout)

      expect(response.status).toBe(422)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM_BASE}invalid-layout`)
      expect(await storedRowCount()).toBe(0)
    })

    it('refuses viewer with 403 forbidden and persists nothing', async () => {
      const response = await viewer.put(LAYOUT, layoutWith(tab('open', [widgetOn('w-open')])))

      expect(response.status).toBe(403)
      expect((await response.json<GateBody>()).error).toBe('forbidden')
      expect(await storedRowCount()).toBe(0)
    })

    it('refuses a global manage_users holder with 403 forbidden, since the old gate was manage_users@*', async () => {
      await assignViewer('layout-viewer-user-manager', ROLE_USER_MANAGER, '*')

      const response = await viewer.put(LAYOUT, layoutWith(tab('open', [widgetOn('w-open')])))

      expect(response.status).toBe(403)
      expect((await response.json<GateBody>()).error).toBe('forbidden')
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 409 layout-locked to a manage_roles@* holder without content:read@authors, leaving the row byte-unchanged', async () => {
      // The 409 exists because the filter would otherwise make this save destructive: the holder never
      // receives the authors widget, so writing back their view would delete it. Replaced by server-side
      // re-injection of locked widgets in ROADMAP entry 5.
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open'), widgetOn('w-authors', 'authors')])))
      const before = await storedLayoutJson()
      await makeViewerRoleManagerWithoutContentRead()

      const response = await viewer.put(LAYOUT, layoutWith(tab('overview', [widgetOn('w-open')])))

      expect(response.status).toBe(409)
      expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-locked`)
      expect(await storedLayoutJson()).toBe(before)
    })

    it('succeeds for the same manage_roles@* holder when the stored layout has no seed-bound widget they cannot read', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')])))
      await makeViewerRoleManagerWithoutContentRead()

      const response = await viewer.put(LAYOUT, layoutWith(tab('renamed', [widgetOn('w-open')])))

      expect(response.status).toBe(200)
      const stored = JSON.parse((await storedLayoutJson()) ?? 'null') as DashboardLayout
      expect(stored.pages.map(page => page.slug)).toEqual(['renamed'])
    })

    it('answers 400 invalid-json for a malformed body and persists nothing', async () => {
      const response = await admin.request(LAYOUT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      })

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}invalid-json`)
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 422 invalid-layout for a layout with no pages and persists nothing', async () => {
      const response = await admin.put(LAYOUT, { version: 2, pages: [] })

      expect(response.status).toBe(422)
      expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}invalid-layout`)
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 422 for a layout above MAX_DASHBOARD_LAYOUT_BYTES and persists nothing', async () => {
      const heavyWidgets = Array.from({ length: 40 }, (_, index) => ({
        id: `w-heavy-${index}`,
        type: 'core/text',
        config: { blob: 'x'.repeat(MAX_WIDGET_CONFIG_BYTES - 20) },
      }))
      const layout = layoutWith(tab('heavy', heavyWidgets))
      expect(JSON.stringify(layout).length).toBeGreaterThan(MAX_DASHBOARD_LAYOUT_BYTES)

      const response = await admin.put(LAYOUT, layout)

      expect(response.status).toBe(422)
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 422 naming the id for duplicate widget ids and persists nothing', async () => {
      const layout = layoutWith(tab('overview', [widgetOn('w-dup'), widgetOn('w-dup')]))

      const response = await admin.put(LAYOUT, layout)

      expect(response.status).toBe(422)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM_BASE}invalid-layout`)
      expect(body.detail).toContain('w-dup')
      expect(await storedRowCount()).toBe(0)
    })

    it('strips a widget on an unregistered seed with a warning and persists the cleaned layout', async () => {
      const layout = layoutWith(tab('overview', [widgetOn('w-open'), widgetOn('w-ghost', 'ghost-seed')]))

      const response = await admin.put(LAYOUT, layout)

      expect(response.status).toBe(200)
      const body = await response.json<SaveBody>()
      expect(body.warnings).toHaveLength(1)
      expect(body.layout.pages[0].sections[0].columns[0].widgets.map(widget => widget.id)).toEqual(['w-open'])
      expect(await storedLayoutJson()).toBe(JSON.stringify(body.layout))
    })

    it('persists an unknown widget type unchanged with no warning', async () => {
      const unknown: DashboardWidgetInstance = { id: 'w-acme', type: '@acme/weather', config: { city: 'Rome' } }

      const response = await admin.put(LAYOUT, layoutWith(tab('overview', [unknown])))

      expect(response.status).toBe(200)
      const body = await response.json<SaveBody>()
      expect(body.warnings).toEqual([])
      expect(body.layout.pages[0].sections[0].columns[0].widgets).toEqual([unknown])
      expect(await storedRowCount()).toBe(1)
    })
  })

  describe(`DELETE ${LAYOUT}`, () => {
    it('removes the stored row for admin', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')])))

      const response = await admin.delete(LAYOUT)

      expect(response.status).toBe(200)
      expect(await response.json<{ ok: boolean }>()).toEqual({ ok: true })
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 409 layout-locked to a manage_roles@* holder without content:read@authors, keeping the row', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-authors', 'authors')])))
      await makeViewerRoleManagerWithoutContentRead()

      const response = await viewer.delete(LAYOUT)

      expect(response.status).toBe(409)
      expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-locked`)
      expect(await storedRowCount()).toBe(1)
    })

    it('refuses viewer with 403 forbidden and keeps the row', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')])))

      const response = await viewer.delete(LAYOUT)

      expect(response.status).toBe(403)
      expect((await response.json<GateBody>()).error).toBe('forbidden')
      expect(await storedRowCount()).toBe(1)
    })
  })

  describe(`GET ${LAYOUT}/roles`, () => {
    it('serves admin every role as exactly { id, name, icon }, SuperAdmin included, with no permissions key', async () => {
      const response = await admin.get(`${LAYOUT}/roles`)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const body = await response.json<RoleItem[]>()
      expect(body.map(role => Object.keys(role).sort())).toEqual(body.map(() => ['icon', 'id', 'name']))
      expect(body.map(role => role.name)).toEqual(expect.arrayContaining(['SuperAdmin', 'layout-reader', 'layout-audience']))
      const total = await harness.db.prepare('SELECT COUNT(*) AS n FROM roles').first<{ n: number }>()
      expect(body).toHaveLength(total?.n ?? -1)
    })

    it('refuses viewer with 403 forbidden', async () => {
      const response = await viewer.get(`${LAYOUT}/roles`)

      expect(response.status).toBe(403)
      expect((await response.json<GateBody>()).error).toBe('forbidden')
    })
  })

  describe('removed per-scope URLs', () => {
    it('answer admin 403 route_not_registered, not 404, and leave a legacy row untouched', async () => {
      // Out of the route allowlist, so the permission middleware refuses them before Hono can answer 404.
      await harness.db
        .prepare('INSERT INTO dashboard_layouts (scope, layout, updated_by) VALUES (?, ?, ?)')
        .bind('role:editor', JSON.stringify(layoutWith(tab('legacy', [widgetOn('w-legacy')]))), 'legacy-user')
        .run()
      const removed = [
        { method: 'GET', path: `${LAYOUT}/scopes` },
        { method: 'GET', path: `${LAYOUT}/role:editor` },
        { method: 'PUT', path: `${LAYOUT}/role:editor` },
        { method: 'DELETE', path: `${LAYOUT}/role:editor` },
      ]

      const results = await Promise.all(
        removed.map(async ({ method, path }) => {
          const response = await admin.request(path, { method })
          return { status: response.status, error: (await response.json<GateBody>()).error }
        }),
      )

      expect(results).toEqual(removed.map(() => ({ status: 403, error: 'route_not_registered' })))
      const legacy = await harness.db
        .prepare("SELECT COUNT(*) AS n FROM dashboard_layouts WHERE scope = 'role:editor'")
        .first<{ n: number }>()
      expect(legacy?.n).toBe(1)
    })
  })
})
