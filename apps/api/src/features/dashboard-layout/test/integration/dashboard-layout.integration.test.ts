// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Dashboard-layout slice — integration tier.
 * Covers the single `default` layout, the server-side audience and editor projections, the
 * `manage_layout` / `manage_roles` write gates, the structural gate, locked-widget re-injection and the
 * compare-and-swap precondition, against real D1 and the full middleware chain.
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
  updatedAt: number | null
}

interface SaveBody {
  ok: boolean
  layout: DashboardLayout
  warnings: string[]
  updatedAt: number
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
const ROLE_LAYOUT_EDITOR = 'a1b2c3d4-0005-4a1b-8c2d-3e4f5a6b7c05'
const ROLE_SCOPED_LAYOUT = 'a1b2c3d4-0006-4a1b-8c2d-3e4f5a6b7c06'

// `core/text` has no built-in requirement, so only `seedSlug` decides whether a caller can use the widget.
function widgetOn(id: string, seedSlug?: string): DashboardWidgetInstance {
  return { id, type: 'core/text', config: seedSlug ? { seedSlug } : {} }
}

/** The widget layout editors without `content:read@authors` receive as a placeholder. */
const LOCKED_WIDGET: DashboardWidgetInstance = {
  id: 'w-locked',
  type: 'core/text',
  title: 'Restricted board',
  config: { seedSlug: 'authors', limit: 5 },
}

const PLACEHOLDER: DashboardWidgetInstance = { id: 'w-locked', type: 'core/locked', config: {} }

function tab(slug: string, widgets: DashboardWidgetInstance[], roles?: string[]): DashboardPageLayout {
  return {
    id: `page-${slug}`,
    slug,
    label: slug,
    ...(roles ? { roles } : {}),
    sections: [{ id: `section-${slug}`, columns: [{ id: `col-${slug}`, widgets }] }],
  }
}

/** One tab whose single section holds one column per widget stack. */
function tabWithColumns(slug: string, stacks: DashboardWidgetInstance[][]): DashboardPageLayout {
  return {
    id: `page-${slug}`,
    slug,
    label: slug,
    sections: [{ id: `section-${slug}`, columns: stacks.map((widgets, index) => ({ id: `col-${slug}-${index}`, widgets })) }],
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

  /** The stored row's version, or null when nothing is stored: the value a well-behaved client echoes back. */
  async function storedVersion(): Promise<number | null> {
    const row = await harness.db
      .prepare('SELECT updated_at FROM dashboard_layouts WHERE scope = ?')
      .bind(DEFAULT_DASHBOARD_SCOPE)
      .first<{ updated_at: number }>()
    return row?.updated_at ?? null
  }

  function preconditionHeaders(precondition: number | null): Record<string, string> {
    return precondition === null ? { 'If-None-Match': '*' } : { 'If-Match': `"${precondition}"` }
  }

  function put(client: TestClient, layout: DashboardLayout, precondition: number | null): Promise<Response> {
    return client.put(LAYOUT, layout, { headers: preconditionHeaders(precondition) })
  }

  async function storeAsAdmin(layout: DashboardLayout): Promise<void> {
    const response = await put(admin, layout, await storedVersion())
    expect(response.status).toBe(200)
  }

  /** Replaces the viewer's baseline `content:read@posts` with global `manage_roles` and no content read. */
  async function makeViewerRoleManagerWithoutContentRead(): Promise<void> {
    await harness.db.prepare('DELETE FROM user_role_assignments WHERE user_id = ?').bind(CANONICAL_USERS.viewer.id).run()
    await assignViewer('layout-viewer-role-manager', ROLE_ROLE_MANAGER, '*')
  }

  /** Adds global `manage_layout` on top of the baseline `content:read@posts`, so `authors` stays unreadable. */
  async function makeViewerLayoutEditorWithoutAuthors(): Promise<void> {
    await assignViewer('layout-viewer-layout-editor', ROLE_LAYOUT_EDITOR, '*')
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
    await insertRole(ROLE_LAYOUT_EDITOR, 'layout-editor', ['manage_layout'])
    await insertRole(ROLE_SCOPED_LAYOUT, 'layout-scoped-editor', ['manage_layout'])
    // The role assignment repository decay-filters scopes against the D1 `seeds` table, so the
    // `posts` scope below only resolves because the harness provisions the canonical seeds there.
    await assignViewer('layout-viewer-reader', ROLE_READER, 'posts')
  })

  describe(`GET ${LAYOUT}`, () => {
    it('returns 200 { layout: null, updatedAt: null } with Cache-Control no-store when nothing is stored', async () => {
      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const body = await response.json<LayoutBody>()
      expect(body).toEqual({ layout: null, updatedAt: null })
    })

    it('ignores a legacy role:editor row, answering { layout: null } to viewer and admin', async () => {
      await harness.db
        .prepare('INSERT INTO dashboard_layouts (scope, layout, updated_by) VALUES (?, ?, ?)')
        .bind('role:editor', JSON.stringify(layoutWith(tab('legacy', [widgetOn('w-legacy')]))), 'legacy-user')
        .run()

      const viewerResponse = await viewer.get(LAYOUT)
      const adminResponse = await admin.get(LAYOUT)

      expect(viewerResponse.status).toBe(200)
      expect(await viewerResponse.json<LayoutBody>()).toEqual({ layout: null, updatedAt: null })
      expect(adminResponse.status).toBe(200)
      expect(await adminResponse.json<LayoutBody>()).toEqual({ layout: null, updatedAt: null })
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

    it('answers the stored row version as updatedAt', async () => {
      await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')])))

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const body = await response.json<LayoutBody>()
      expect(body.updatedAt).toBe(await storedVersion())
    })

    it('serves a manage_layout@* editor without content:read@authors every tab with roles and the locked widget as a bare placeholder', async () => {
      await storeAsAdmin(
        layoutWith(
          tab('overview', [widgetOn('w-open'), LOCKED_WIDGET]),
          tab('team', [widgetOn('w-team')], [ROLE_AUDIENCE]),
        ),
      )
      await makeViewerLayoutEditorWithoutAuthors()

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).not.toContain('authors')
      expect(text).not.toContain('Restricted board')
      const body = JSON.parse(text) as LayoutBody
      expect(body.layout?.pages.map(page => page.slug)).toEqual(['overview', 'team'])
      expect(body.layout?.pages[1].roles).toEqual([ROLE_AUDIENCE])
      expect(body.layout?.pages[0].sections[0].columns[0].widgets).toEqual([widgetOn('w-open'), PLACEHOLDER])
    })

    it('withholds a core/setup-checklist widget from a viewer without manage_users@* and drops the tab it emptied', async () => {
      const setupChecklist: DashboardWidgetInstance = { id: 'w-setup', type: 'core/setup-checklist', config: {} }
      await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')]), tab('setup', [setupChecklist])))

      const response = await viewer.get(LAYOUT)

      expect(response.status).toBe(200)
      const body = await response.json<LayoutBody>()
      expect(body.layout?.pages.map(page => page.slug)).toEqual(['open'])
    })
  })

  describe(`PUT ${LAYOUT}`, () => {
    it('persists a tab naming a known role id, and admin reads it back with that roles array', async () => {
      const layout = layoutWith(tab('team', [widgetOn('w-team')], [ROLE_AUDIENCE]))

      const response = await put(admin, layout, null)

      expect(response.status).toBe(200)
      expect((await response.json<SaveBody>()).ok).toBe(true)
      const readBack = await (await admin.get(LAYOUT)).json<LayoutBody>()
      expect(readBack.layout?.pages[0].roles).toEqual([ROLE_AUDIENCE])
      expect(await storedRowCount()).toBe(1)
    })

    it('answers 422 invalid-layout for an unknown role id and persists nothing', async () => {
      const layout = layoutWith(tab('team', [widgetOn('w-team')], ['a1b2c3d4-ffff-4a1b-8c2d-3e4f5a6b7cff']))

      const response = await put(admin, layout, null)

      expect(response.status).toBe(422)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM_BASE}invalid-layout`)
      expect(await storedRowCount()).toBe(0)
    })

    it('refuses viewer with 403 forbidden and persists nothing', async () => {
      const response = await put(viewer, layoutWith(tab('open', [widgetOn('w-open')])), null)

      expect(response.status).toBe(403)
      expect((await response.json<GateBody>()).error).toBe('forbidden')
      expect(await storedRowCount()).toBe(0)
    })

    it('refuses a global manage_users holder with 403 forbidden, since neither layout permission is held', async () => {
      await assignViewer('layout-viewer-user-manager', ROLE_USER_MANAGER, '*')

      const response = await put(viewer, layoutWith(tab('open', [widgetOn('w-open')])), null)

      expect(response.status).toBe(403)
      expect((await response.json<GateBody>()).error).toBe('forbidden')
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 400 invalid-json for a malformed body and persists nothing', async () => {
      const response = await admin.request(LAYOUT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
        body: '{not json',
      })

      expect(response.status).toBe(400)
      expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}invalid-json`)
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 422 invalid-layout for a layout with no pages and persists nothing', async () => {
      const response = await admin.put(LAYOUT, { version: 2, pages: [] }, { headers: preconditionHeaders(null) })

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

      const response = await put(admin, layout, null)

      expect(response.status).toBe(422)
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 422 naming the id for duplicate widget ids and persists nothing', async () => {
      const layout = layoutWith(tab('overview', [widgetOn('w-dup'), widgetOn('w-dup')]))

      const response = await put(admin, layout, null)

      expect(response.status).toBe(422)
      const body = await response.json<ProblemBody>()
      expect(body.type).toBe(`${PROBLEM_BASE}invalid-layout`)
      expect(body.detail).toContain('w-dup')
      expect(await storedRowCount()).toBe(0)
    })

    it('strips a widget on an unregistered seed with a warning and persists the cleaned layout', async () => {
      const layout = layoutWith(tab('overview', [widgetOn('w-open'), widgetOn('w-ghost', 'ghost-seed')]))

      const response = await put(admin, layout, null)

      expect(response.status).toBe(200)
      const body = await response.json<SaveBody>()
      expect(body.warnings).toHaveLength(1)
      expect(body.layout.pages[0].sections[0].columns[0].widgets.map(widget => widget.id)).toEqual(['w-open'])
      expect(await storedLayoutJson()).toBe(JSON.stringify(body.layout))
    })

    it('persists an unknown widget type unchanged with no warning', async () => {
      const unknown: DashboardWidgetInstance = { id: 'w-acme', type: '@acme/weather', config: { city: 'Rome' } }

      const response = await put(admin, layoutWith(tab('overview', [unknown])), null)

      expect(response.status).toBe(200)
      const body = await response.json<SaveBody>()
      expect(body.warnings).toEqual([])
      expect(body.layout.pages[0].sections[0].columns[0].widgets).toEqual([unknown])
      expect(await storedRowCount()).toBe(1)
    })

    describe('precondition', () => {
      it('answers 428 precondition-required without If-Match or If-None-Match and persists nothing', async () => {
        const response = await admin.put(LAYOUT, layoutWith(tab('open', [widgetOn('w-open')])))

        expect(response.status).toBe(428)
        expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}precondition-required`)
        expect(await storedRowCount()).toBe(0)
      })

      it('answers 409 layout-conflict for an If-Match older than the stored version and leaves the row byte-unchanged', async () => {
        await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')])))
        const before = await storedLayoutJson()
        const stale = (await storedVersion())! - 1

        const response = await put(admin, layoutWith(tab('renamed', [widgetOn('w-open')])), stale)

        expect(response.status).toBe(409)
        expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-conflict`)
        expect(await storedLayoutJson()).toBe(before)
      })

      it('answers 409 layout-conflict for If-None-Match: * while a row exists and leaves the row byte-unchanged', async () => {
        await storeAsAdmin(layoutWith(tab('open', [widgetOn('w-open')])))
        const before = await storedLayoutJson()

        const response = await put(admin, layoutWith(tab('renamed', [widgetOn('w-open')])), null)

        expect(response.status).toBe(409)
        expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-conflict`)
        expect(await storedLayoutJson()).toBe(before)
      })

      it('returns a strictly greater updatedAt on a second save under the harness frozen clock', async () => {
        const layout = layoutWith(tab('open', [widgetOn('w-open')]))
        const first = await (await put(admin, layout, null)).json<SaveBody>()

        const second = await put(admin, layout, first.updatedAt)

        expect(second.status).toBe(200)
        const body = await second.json<SaveBody>()
        expect(body.updatedAt).toBeGreaterThan(first.updatedAt)
        expect(await storedVersion()).toBe(body.updatedAt)
      })

      it('answers 409 layout-conflict when a superseded version is replayed', async () => {
        const layout = layoutWith(tab('open', [widgetOn('w-open')]))
        const first = await (await put(admin, layout, null)).json<SaveBody>()
        await put(admin, layout, first.updatedAt)
        const before = await storedLayoutJson()

        const replay = await put(admin, layout, first.updatedAt)

        expect(replay.status).toBe(409)
        expect((await replay.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-conflict`)
        expect(await storedLayoutJson()).toBe(before)
      })
    })

    describe('manage_layout editor', () => {
      const STORED = () =>
        layoutWith(
          tabWithColumns('overview', [[widgetOn('w-open'), LOCKED_WIDGET], []]),
          tab('team', [widgetOn('w-team')]),
        )

      it('answers 403 layout-edit-forbidden to a holder of manage_layout on posts only and persists nothing', async () => {
        await assignViewer('layout-viewer-scoped-layout', ROLE_SCOPED_LAYOUT, 'posts')

        const response = await put(viewer, layoutWith(tab('open', [widgetOn('w-open')])), null)

        expect(response.status).toBe(403)
        expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-edit-forbidden`)
        expect(await storedRowCount()).toBe(0)
      })

      it('saves a change confined to the sections of existing tabs', async () => {
        await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')]), tab('team', [widgetOn('w-team')])))
        await makeViewerLayoutEditorWithoutAuthors()
        const edited = layoutWith(tab('overview', [widgetOn('w-open'), widgetOn('w-added')]), tab('team', [widgetOn('w-team')]))

        const response = await put(viewer, edited, await storedVersion())

        expect(response.status).toBe(200)
        expect(JSON.parse((await storedLayoutJson()) ?? 'null')).toEqual(edited)
      })

      it('answers 403 layout-structure-forbidden for an added tab, a reorder, a renamed label and a changed audience, leaving the row byte-unchanged', async () => {
        await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')]), tab('team', [widgetOn('w-team')])))
        await makeViewerLayoutEditorWithoutAuthors()
        const before = await storedLayoutJson()
        const version = await storedVersion()
        const overview = tab('overview', [widgetOn('w-open')])
        const team = tab('team', [widgetOn('w-team')])
        const structuralVariants = [
          layoutWith(overview, team, tab('extra', [widgetOn('w-extra')])),
          layoutWith(team, overview),
          layoutWith({ ...overview, label: 'Renamed' }, team),
          layoutWith({ ...overview, roles: [ROLE_AUDIENCE] }, team),
        ]

        const responses = await Promise.all(structuralVariants.map(variant => put(viewer, variant, version)))

        expect(responses.map(response => response.status)).toEqual(structuralVariants.map(() => 403))
        const types = await Promise.all(responses.map(async response => (await response.json<ProblemBody>()).type))
        expect(types).toEqual(structuralVariants.map(() => `${PROBLEM_BASE}layout-structure-forbidden`))
        expect(await storedLayoutJson()).toBe(before)
      })

      it('answers 403 layout-structure-forbidden when nothing is stored and persists nothing', async () => {
        await makeViewerLayoutEditorWithoutAuthors()

        const response = await put(viewer, layoutWith(tab('open', [widgetOn('w-open')])), null)

        expect(response.status).toBe(403)
        expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-structure-forbidden`)
        expect(await storedRowCount()).toBe(0)
      })

      it('persists the locked widget verbatim when the placeholder comes back, and answers it as a placeholder', async () => {
        await storeAsAdmin(STORED())
        await makeViewerLayoutEditorWithoutAuthors()
        const edited = layoutWith(
          tabWithColumns('overview', [[{ ...widgetOn('w-open'), title: 'Edited' }, PLACEHOLDER], []]),
          tab('team', [widgetOn('w-team')]),
        )

        const response = await put(viewer, edited, await storedVersion())

        expect(response.status).toBe(200)
        const body = await response.json<SaveBody>()
        expect(body.layout.pages[0].sections[0].columns[0].widgets).toEqual([{ ...widgetOn('w-open'), title: 'Edited' }, PLACEHOLDER])
        const stored = JSON.parse((await storedLayoutJson()) ?? 'null') as DashboardLayout
        expect(stored.pages[0].sections[0].columns[0].widgets).toEqual([{ ...widgetOn('w-open'), title: 'Edited' }, LOCKED_WIDGET])
      })

      it('answers 422 invalid-layout when the placeholder is removed or moved to another column, leaving the row byte-unchanged', async () => {
        await storeAsAdmin(STORED())
        await makeViewerLayoutEditorWithoutAuthors()
        const before = await storedLayoutJson()
        const version = await storedVersion()
        const team = tab('team', [widgetOn('w-team')])
        const variants = [
          layoutWith(tabWithColumns('overview', [[widgetOn('w-open')], []]), team),
          layoutWith(tabWithColumns('overview', [[widgetOn('w-open')], [PLACEHOLDER]]), team),
        ]

        const responses = await Promise.all(variants.map(variant => put(viewer, variant, version)))

        expect(responses.map(response => response.status)).toEqual([422, 422])
        const types = await Promise.all(responses.map(async response => (await response.json<ProblemBody>()).type))
        expect(types).toEqual([`${PROBLEM_BASE}invalid-layout`, `${PROBLEM_BASE}invalid-layout`])
        expect(await storedLayoutJson()).toBe(before)
      })

      it('answers 422 invalid-layout for a widget added on authors and leaves the row byte-unchanged', async () => {
        await storeAsAdmin(STORED())
        await makeViewerLayoutEditorWithoutAuthors()
        const before = await storedLayoutJson()
        const edited = layoutWith(
          tabWithColumns('overview', [[widgetOn('w-open'), PLACEHOLDER, widgetOn('w-sneaky', 'authors')], []]),
          tab('team', [widgetOn('w-team')]),
        )

        const response = await put(viewer, edited, await storedVersion())

        expect(response.status).toBe(422)
        expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}invalid-layout`)
        expect(await storedLayoutJson()).toBe(before)
      })
    })

    describe('manage_roles holder without content:read@authors', () => {
      it('deletes a whole tab holding a locked widget, which is gone from the stored row', async () => {
        await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')]), tab('restricted', [LOCKED_WIDGET])))
        await makeViewerRoleManagerWithoutContentRead()
        const remaining = layoutWith(tab('overview', [widgetOn('w-open')]))

        const response = await put(viewer, remaining, await storedVersion())

        expect(response.status).toBe(200)
        const stored = JSON.parse((await storedLayoutJson()) ?? 'null') as DashboardLayout
        expect(stored.pages.map(page => page.slug)).toEqual(['overview'])
      })
    })
  })

  describe(`DELETE ${LAYOUT}`, () => {
    it('removes the stored row for admin carrying the current If-Match', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')])))

      const response = await admin.delete(LAYOUT, { headers: preconditionHeaders(await storedVersion()) })

      expect(response.status).toBe(200)
      expect(await response.json<{ ok: boolean }>()).toEqual({ ok: true })
      expect(await storedRowCount()).toBe(0)
    })

    it('resets a layout holding a locked widget for a manage_roles@* holder without content:read@authors', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open'), LOCKED_WIDGET])))
      await makeViewerRoleManagerWithoutContentRead()

      const response = await viewer.delete(LAYOUT, { headers: preconditionHeaders(await storedVersion()) })

      expect(response.status).toBe(200)
      expect(await storedRowCount()).toBe(0)
    })

    it('answers 428 precondition-required without a precondition and keeps the row', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')])))

      const response = await admin.delete(LAYOUT)

      expect(response.status).toBe(428)
      expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}precondition-required`)
      expect(await storedRowCount()).toBe(1)
    })

    it('answers 409 layout-conflict for a stale If-Match and keeps the row', async () => {
      await storeAsAdmin(layoutWith(tab('overview', [widgetOn('w-open')])))
      const stale = (await storedVersion())! - 1

      const response = await admin.delete(LAYOUT, { headers: preconditionHeaders(stale) })

      expect(response.status).toBe(409)
      expect((await response.json<ProblemBody>()).type).toBe(`${PROBLEM_BASE}layout-conflict`)
      expect(await storedRowCount()).toBe(1)
    })

    it('succeeds as a no-op for If-None-Match: * when nothing is stored', async () => {
      const response = await admin.delete(LAYOUT, { headers: preconditionHeaders(null) })

      expect(response.status).toBe(200)
      expect(await storedRowCount()).toBe(0)
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
