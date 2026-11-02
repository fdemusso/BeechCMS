// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { buildEffectivePermissions } from '../rbac/evaluate.js'
import type { Permission, Scope } from '../rbac/permissions.js'
import type { EffectivePermissions, PermissionAssignment, RoleRecord } from '../rbac/types.js'
import type { DashboardLayout, DashboardWidgetInstance } from './dashboard-layout.js'
import {
  filterDashboardLayoutByWidgetRequirements,
  isWidgetLockedFor,
  isWidgetRequirementMet,
  LOCKED_WIDGET_TYPE,
  resolveCoreWidgetRequirement,
  type WidgetRequirement,
  type WidgetRequirementLookup,
} from './widget-requirements.js'

// Core cannot depend on @beechcms/testing, so the canonical seed slugs `posts` and `authors` are repeated here.
const ROLE_GLOBAL = '5c1d7a3e-2b4f-4a69-8d0e-3f1a2b4c5d6e'
const ROLE_POSTS = 'a8e2c4f6-1d3b-4579-9a0c-2e4f6a8c0e1b'
const ROLE_AUTHORS = '2f4a6c8e-0b1d-4357-8f9a-1c3e5a7b9d0f'

function role(id: string, permissions: Permission[]): RoleRecord {
  return { id, name: id, description: null, isSystem: false, permissions, createdAt: 0, updatedAt: 0 }
}

function assignment(roleId: string, scope: Scope): PermissionAssignment {
  return { id: `${roleId}@${scope}`, userId: 'viewer-1', roleId, scope }
}

/** Grants `permissions` to a viewer at `scope` through the real core evaluator. */
function authority(permissions: Permission[], scope: Scope): EffectivePermissions {
  const roleId = scope === '*' ? ROLE_GLOBAL : scope === 'posts' ? ROLE_POSTS : ROLE_AUTHORS
  return buildEffectivePermissions([assignment(roleId, scope)], [role(roleId, permissions)])
}

const NO_AUTHORITY = buildEffectivePermissions([], [])

function widget(id: string, type: string, config: Record<string, unknown> = {}): DashboardWidgetInstance {
  return { id, type, config }
}

function layoutOf(...pages: DashboardLayout['pages']): DashboardLayout {
  return { version: 1, pages }
}

/** One page whose sections each hold one column per widget stack given. */
function page(slug: string, sections: DashboardWidgetInstance[][][], roles?: string[]): DashboardLayout['pages'][number] {
  return {
    id: `page-${slug}`,
    slug,
    label: slug,
    ...(roles ? { roles } : {}),
    sections: sections.map((stacks, s) => ({
      id: `${slug}-s${s}`,
      columns: stacks.map((widgets, c) => ({ id: `${slug}-s${s}-c${c}`, widgets })),
    })),
  }
}

function widgetIds(layout: DashboardLayout): string[] {
  return layout.pages.flatMap((p) => p.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets.map((w) => w.id))))
}

describe('isWidgetRequirementMet', () => {
  it('an absent requirement is met by a caller with no authority', () => {
    const met = isWidgetRequirementMet(undefined, NO_AUTHORITY, {})

    expect(met).toBe(true)
  })

  it('global-permission is met by the global grant and never by the same permission granted on one seed', () => {
    const permissions: Permission[] = ['manage_users', 'view_analytics', 'content:read']

    const results = permissions.map((permission) => {
      const requirement: WidgetRequirement = { kind: 'global-permission', permission }
      return {
        permission,
        global: isWidgetRequirementMet(requirement, authority([permission], '*'), {}),
        scoped: isWidgetRequirementMet(requirement, authority([permission], 'posts'), {}),
      }
    })

    expect(results).toEqual(permissions.map((permission) => ({ permission, global: true, scoped: false })))
  })

  it('seed-read is met for a bound seed by content:read on that seed and not on another', () => {
    const requirement: WidgetRequirement = { kind: 'seed-read' }

    const onBoundSeed = isWidgetRequirementMet(requirement, authority(['content:read'], 'posts'), { seedSlug: 'posts' })
    const onOtherSeed = isWidgetRequirementMet(requirement, authority(['content:read'], 'authors'), { seedSlug: 'posts' })

    expect(onBoundSeed).toBe(true)
    expect(onOtherSeed).toBe(false)
  })

  it('seed-read with an empty or absent seedSlug is met by content:read on any one seed and not by a caller with none', () => {
    const requirement: WidgetRequirement = { kind: 'seed-read' }
    const reader = authority(['content:read'], 'authors')

    const results = [{ seedSlug: '' }, {}].map((config) => ({
      reader: isWidgetRequirementMet(requirement, reader, config),
      nobody: isWidgetRequirementMet(requirement, NO_AUTHORITY, config),
    }))

    expect(results).toEqual([
      { reader: true, nobody: false },
      { reader: true, nobody: false },
    ])
  })

  it('any-seed-read is met by content:read on one seed alone and not by view_analytics alone', () => {
    const requirement: WidgetRequirement = { kind: 'any-seed-read' }

    const reader = isWidgetRequirementMet(requirement, authority(['content:read'], 'posts'), {})
    const analyst = isWidgetRequirementMet(requirement, authority(['view_analytics'], '*'), {})

    expect(reader).toBe(true)
    expect(analyst).toBe(false)
  })

  it('a non-string seedSlug is treated as absent', () => {
    const requirement: WidgetRequirement = { kind: 'seed-read' }

    const met = isWidgetRequirementMet(requirement, authority(['content:read'], 'posts'), { seedSlug: 42 })

    expect(met).toBe(true)
  })
})

describe('resolveCoreWidgetRequirement', () => {
  it('every built-in type resolves to the row of the requirement table', () => {
    const manageUsers: WidgetRequirement = { kind: 'global-permission', permission: 'manage_users' }
    const viewAnalytics: WidgetRequirement = { kind: 'global-permission', permission: 'view_analytics' }
    const readGlobally: WidgetRequirement = { kind: 'global-permission', permission: 'content:read' }
    const seedRead: WidgetRequirement = { kind: 'seed-read' }
    const anySeedRead: WidgetRequirement = { kind: 'any-seed-read' }
    const table: Array<[string, WidgetRequirement | undefined]> = [
      ['core/setup-checklist', manageUsers],
      ['core/system-health', viewAnalytics],
      ['core/site-status', viewAnalytics],
      ['core/storage', viewAnalytics],
      ['core/media-gallery', readGlobally],
      ['core/line-chart', seedRead],
      ['core/bar-chart', seedRead],
      ['core/area-chart', seedRead],
      ['core/pie-chart', seedRead],
      ['core/data-table', seedRead],
      ['core/recent-content', seedRead],
      ['core/pending-drafts', seedRead],
      ['core/activity-feed', seedRead],
      ['core/publication-stats', anySeedRead],
      ['core/content-pulse', anySeedRead],
      ['core/recent-activity', anySeedRead],
      ['core/quick-draft', anySeedRead],
      ['core/text', undefined],
      ['core/quick-actions', undefined],
      ['core/ai-insights', undefined],
    ]

    const resolved = table.map(([type]) => [type, resolveCoreWidgetRequirement({ type, config: {} })])

    expect(resolved).toEqual(table)
  })

  it('core/stat lets seedSlug win over statKey and otherwise follows statKey', () => {
    const resolve = (config: Record<string, unknown>) => resolveCoreWidgetRequirement({ type: 'core/stat', config })

    const results = {
      seedWins: resolve({ seedSlug: 'posts', statKey: 'visitors' }),
      visitors: resolve({ statKey: 'visitors' }),
      traffic: resolve({ seedSlug: '', statKey: 'traffic' }),
      storage: resolve({ statKey: 'storage' }),
      total: resolve({ statKey: 'total' }),
      absent: resolve({}),
    }

    const analytics: WidgetRequirement = { kind: 'global-permission', permission: 'view_analytics' }
    expect(results).toEqual({
      seedWins: { kind: 'seed-read' },
      visitors: analytics,
      traffic: analytics,
      storage: analytics,
      total: { kind: 'any-seed-read' },
      absent: { kind: 'any-seed-read' },
    })
  })

  it('an unknown core type and a custom type resolve to undefined', () => {
    const unknownCore = resolveCoreWidgetRequirement({ type: 'core/not-a-widget', config: {} })
    const custom = resolveCoreWidgetRequirement({ type: '@acme/x', config: {} })

    expect(unknownCore).toBeUndefined()
    expect(custom).toBeUndefined()
  })
})

describe('isWidgetLockedFor', () => {
  it('locks a core/locked placeholder even for full global authority', () => {
    const everything = authority(['content:read', 'manage_users', 'manage_roles', 'view_analytics'], '*')

    const locked = isWidgetLockedFor(widget('w1', LOCKED_WIDGET_TYPE), everything)

    expect(locked).toBe(true)
  })

  it('locks a custom widget bound to a seed the caller cannot read', () => {
    const locked = isWidgetLockedFor(widget('w1', '@acme/x', { seedSlug: 'authors' }), authority(['content:read'], 'posts'))

    expect(locked).toBe(true)
  })

  it('locks core/setup-checklist for a caller without manage_users@*', () => {
    const locked = isWidgetLockedFor(widget('w1', 'core/setup-checklist'), authority(['content:read'], 'posts'))

    expect(locked).toBe(true)
  })

  it('never locks a custom widget without a seedSlug, even for a caller with no permission', () => {
    const locked = isWidgetLockedFor(widget('w1', '@acme/x'), NO_AUTHORITY)

    expect(locked).toBe(false)
  })

  it('does not lock core/recent-content on a readable seed', () => {
    const locked = isWidgetLockedFor(widget('w1', 'core/recent-content', { seedSlug: 'posts' }), authority(['content:read'], 'posts'))

    expect(locked).toBe(false)
  })
})

describe('filterDashboardLayoutByWidgetRequirements', () => {
  const reader = authority(['content:read'], 'posts')

  it('drops only the widgets whose requirement is unmet and keeps the order of the rest', () => {
    const layout = layoutOf(
      page('overview', [
        [[widget('w1', 'core/text'), widget('w2', 'core/setup-checklist'), widget('w3', 'core/quick-draft')]],
      ]),
    )

    const filtered = filterDashboardLayoutByWidgetRequirements(layout, reader, resolveCoreWidgetRequirement)

    expect(widgetIds(filtered)).toEqual(['w1', 'w3'])
  })

  it('drops a section the projection emptied but keeps a section that was already empty', () => {
    const layout = layoutOf(
      page('overview', [
        [[widget('w1', 'core/setup-checklist')]],
        [[]],
        [[widget('w2', 'core/text')]],
      ]),
    )

    const filtered = filterDashboardLayoutByWidgetRequirements(layout, reader, resolveCoreWidgetRequirement)

    expect(filtered.pages[0].sections.map((section) => section.id)).toEqual(['overview-s1', 'overview-s2'])
  })

  it('drops a page whose sections were all emptied and leaves other pages and their roles untouched', () => {
    const layout = layoutOf(
      page('admin', [[[widget('w1', 'core/setup-checklist')]]], ['role-admin']),
      page('content', [[[widget('w2', 'core/text')]]], ['role-editor']),
    )

    const filtered = filterDashboardLayoutByWidgetRequirements(layout, reader, resolveCoreWidgetRequirement)

    expect(filtered.pages).toEqual([layout.pages[1]])
    expect(filtered.pages[0].roles).toEqual(['role-editor'])
  })

  it('returns no pages when nothing survives', () => {
    const layout = layoutOf(page('admin', [[[widget('w1', 'core/setup-checklist')]]]))

    const filtered = filterDashboardLayoutByWidgetRequirements(layout, NO_AUTHORITY, resolveCoreWidgetRequirement)

    expect(filtered).toEqual({ version: 1, pages: [] })
  })

  it('leaves the input untouched and returns deep-equal output for the same input twice', () => {
    const layout = layoutOf(
      page('overview', [
        [[widget('w1', 'core/setup-checklist')], [widget('w2', 'core/text')]],
        [[widget('w3', 'core/line-chart', { seedSlug: 'authors' })]],
      ]),
    )
    const before = structuredClone(layout)

    const first = filterDashboardLayoutByWidgetRequirements(layout, reader, resolveCoreWidgetRequirement)
    const second = filterDashboardLayoutByWidgetRequirements(layout, reader, resolveCoreWidgetRequirement)

    expect(layout).toEqual(before)
    expect(second).toEqual(first)
    expect(widgetIds(first)).toEqual(['w2'])
  })

  it('consults the supplied lookup for custom types', () => {
    const layout = layoutOf(page('overview', [[[widget('w1', '@acme/x'), widget('w2', 'core/text')]]]))
    const lookup: WidgetRequirementLookup = (w) =>
      w.type === '@acme/x' ? { kind: 'global-permission', permission: 'manage_users' } : undefined

    const filtered = filterDashboardLayoutByWidgetRequirements(layout, reader, lookup)

    expect(widgetIds(filtered)).toEqual(['w2'])
  })

  it('drops a core/locked widget and the section it emptied even when the lookup returns no requirement', () => {
    const layout = layoutOf(
      page('overview', [
        [[widget('w1', LOCKED_WIDGET_TYPE)]],
        [[widget('w2', 'core/text')]],
      ]),
    )

    const filtered = filterDashboardLayoutByWidgetRequirements(layout, reader, () => undefined)

    expect(filtered.pages[0].sections.map((section) => section.id)).toEqual(['overview-s1'])
    expect(widgetIds(filtered)).toEqual(['w2'])
  })
})
