// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { buildEffectivePermissions } from '../rbac/evaluate.js'
import type { Permission, Scope } from '../rbac/permissions.js'
import type { PermissionAssignment, RoleRecord } from '../rbac/types.js'
import type { DashboardLayout, DashboardPageLayout, DashboardWidgetInstance } from './dashboard-layout.js'
import { filterDashboardLayoutForViewer, type DashboardLayoutViewer } from './dashboard-layout-audience.js'

const ROLE_A = '3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c'
const ROLE_B = '7a9d0e2f-1b3c-4d5e-8f6a-0b1c2d3e4f5a'
const ROLE_ORPHAN = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const ROLE_READER = '0e1f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b'
const ROLE_MANAGER = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

function role(id: string, permissions: Permission[]): RoleRecord {
  return { id, name: id, description: null, isSystem: false, permissions, createdAt: 0, updatedAt: 0 }
}

const ROLES: RoleRecord[] = [
  role(ROLE_A, []),
  role(ROLE_B, []),
  role(ROLE_READER, ['content:read']),
  role(ROLE_MANAGER, ['manage_roles']),
]

function assignment(roleId: string, scope: Scope): PermissionAssignment {
  return { id: `${roleId}@${scope}`, userId: 'viewer-1', roleId, scope }
}

function viewerHolding(...assignments: PermissionAssignment[]): DashboardLayoutViewer {
  return {
    roleIds: new Set(assignments.map((held) => held.roleId)),
    permissions: buildEffectivePermissions(assignments, ROLES),
  }
}

function widget(id: string, seedSlug?: string): DashboardWidgetInstance {
  return { id, type: 'core/recent-content', config: seedSlug ? { seedSlug } : {} }
}

/** One page, one section, one column per widget stack. */
function page(slug: string, stacks: DashboardWidgetInstance[][], roles?: string[]): DashboardPageLayout {
  return {
    id: `page-${slug}`,
    slug,
    label: slug,
    ...(roles ? { roles } : {}),
    sections: [
      { id: `section-${slug}`, columns: stacks.map((widgets, i) => ({ id: `col-${slug}-${i}`, widgets })) },
    ],
  }
}

function layoutOf(...pages: DashboardPageLayout[]): DashboardLayout {
  return { version: 1, pages }
}

function slugsOf(layout: DashboardLayout): string[] {
  return layout.pages.map((p) => p.slug)
}

describe('filterDashboardLayoutForViewer', () => {
  it('serves a tab with no roles to a viewer with no assignment when it holds a widget without a seedSlug', () => {
    const layout = layoutOf(page('overview', [[widget('w-1')]]))
    const viewer = viewerHolding()

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(slugsOf(result.layout)).toEqual(['overview'])
    expect(result.hiddenWidgetCount).toBe(0)
  })

  it('drops a tab targeted at role A for a viewer holding only role B', () => {
    const layout = layoutOf(page('team', [[widget('w-1')]], [ROLE_A]))
    const viewer = viewerHolding(assignment(ROLE_B, '*'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(result.layout.pages).toEqual([])
  })

  it('serves a tab targeted at [A, B] to a viewer holding B at a seed scope', () => {
    const layout = layoutOf(page('team', [[widget('w-1')]], [ROLE_A, ROLE_B]))
    const viewer = viewerHolding(assignment(ROLE_B, 'posts'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(slugsOf(result.layout)).toEqual(['team'])
  })

  it('drops a tab whose only role id is held by nobody for a viewer without global manage_roles', () => {
    const layout = layoutOf(page('ghost', [[widget('w-1')]], [ROLE_ORPHAN]))
    const viewer = viewerHolding(assignment(ROLE_A, '*'), assignment(ROLE_READER, '*'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(result.layout.pages).toEqual([])
  })

  it('serves a global manage_roles viewer every tab with roles preserved', () => {
    const layout = layoutOf(
      page('open', [[widget('w-1')]]),
      page('team', [[widget('w-2')]], [ROLE_A]),
      page('ghost', [[widget('w-3')]], [ROLE_ORPHAN]),
    )
    const viewer = viewerHolding(assignment(ROLE_MANAGER, '*'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(slugsOf(result.layout)).toEqual(['open', 'team', 'ghost'])
    expect(result.layout.pages[1].roles).toEqual([ROLE_A])
    expect(result.layout.pages[2].roles).toEqual([ROLE_ORPHAN])
  })

  it('filters a viewer holding manage_roles only on posts like any reader', () => {
    // A scoped grant never satisfies the global check (evaluate.ts hasPermission asymmetry).
    const layout = layoutOf(page('team', [[widget('w-1')]], [ROLE_A]))
    const viewer = viewerHolding(assignment(ROLE_MANAGER, 'posts'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(result.layout.pages).toEqual([])
  })

  it('removes an authors widget for a content:read@posts viewer and counts it as hidden', () => {
    const layout = layoutOf(page('overview', [[widget('w-posts', 'posts'), widget('w-authors', 'authors')]]))
    const viewer = viewerHolding(assignment(ROLE_READER, 'posts'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(result.hiddenWidgetCount).toBe(1)
    expect(result.layout.pages[0].sections[0].columns[0].widgets.map((w) => w.id)).toEqual(['w-posts'])
  })

  it('keeps a posts widget for a content:read@posts viewer', () => {
    const layout = layoutOf(page('overview', [[widget('w-posts', 'posts')]]))
    const viewer = viewerHolding(assignment(ROLE_READER, 'posts'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(result.hiddenWidgetCount).toBe(0)
    expect(result.layout.pages[0].sections[0].columns[0].widgets.map((w) => w.id)).toEqual(['w-posts'])
  })

  it('drops an emptied section, then a tab left with no section, for a reader', () => {
    const layout = layoutOf(
      page('overview', [[widget('w-posts', 'posts')]]),
      page('authors-only', [[widget('w-authors', 'authors')]]),
    )
    const viewer = viewerHolding(assignment(ROLE_READER, 'posts'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(slugsOf(result.layout)).toEqual(['overview'])
    expect(result.hiddenWidgetCount).toBe(1)
  })

  it('keeps emptied, authored-empty sections and the tab for a manage_roles viewer, removing only the widget', () => {
    const emptied = page('authors-only', [[widget('w-authors', 'authors')]])
    emptied.sections.push({ id: 'authored-empty', columns: [{ id: 'col-empty', widgets: [] }] })
    const layout = layoutOf(emptied)
    const viewer = viewerHolding(assignment(ROLE_MANAGER, '*'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(result.hiddenWidgetCount).toBe(1)
    expect(result.layout.pages[0].sections.map((s) => s.id)).toEqual(['section-authors-only', 'authored-empty'])
    expect(result.layout.pages[0].sections[0].columns[0].widgets).toEqual([])
  })

  it('serves a reader pages with no roles key', () => {
    const layout = layoutOf(page('team', [[widget('w-1')]], [ROLE_A]))
    const viewer = viewerHolding(assignment(ROLE_A, '*'))

    const result = filterDashboardLayoutForViewer(layout, viewer)

    expect(slugsOf(result.layout)).toEqual(['team'])
    expect(Object.keys(result.layout.pages[0])).not.toContain('roles')
  })

  it('never mutates its input and returns deep-equal results on repeated calls', () => {
    const layout = layoutOf(
      page('overview', [[widget('w-posts', 'posts'), widget('w-authors', 'authors')]], [ROLE_A]),
      page('other', [[widget('w-2')]], [ROLE_B]),
    )
    const snapshot = structuredClone(layout)
    const viewer = viewerHolding(assignment(ROLE_A, '*'), assignment(ROLE_READER, 'posts'))

    const first = filterDashboardLayoutForViewer(layout, viewer)
    const second = filterDashboardLayoutForViewer(layout, viewer)

    expect(layout).toEqual(snapshot)
    expect(second).toEqual(first)
  })
})
