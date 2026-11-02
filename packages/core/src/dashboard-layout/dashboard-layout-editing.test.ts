// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { buildEffectivePermissions } from '../rbac/evaluate.js'
import type { Permission, Scope } from '../rbac/permissions.js'
import type { EffectivePermissions, PermissionAssignment, RoleRecord } from '../rbac/types.js'
import type { DashboardLayout, DashboardPageLayout, DashboardWidgetInstance } from './dashboard-layout.js'
import { hasDashboardLayoutStructuralChange, reconcileLockedWidgets } from './dashboard-layout-editing.js'
import { LOCKED_WIDGET_TYPE } from './widget-requirements.js'

// Core cannot depend on @beechcms/testing, so the canonical seed slugs `posts` and `authors` are repeated here.
const ROLE_EDITOR = '6b2f9d1c-3e4a-4b58-9c70-2d1e0f3a4b5c'
const ROLE_POSTS_READER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const ROLE_AUDIENCE = 'e4d3c2b1-a0f9-4e8d-b7c6-5a4f3e2d1c0b'

function role(id: string, permissions: Permission[]): RoleRecord {
  return { id, name: id, description: null, isSystem: false, permissions, createdAt: 0, updatedAt: 0 }
}

function assignment(roleId: string, scope: Scope): PermissionAssignment {
  return { id: `${roleId}@${scope}`, userId: 'editor-1', roleId, scope }
}

/** A `manage_layout@*` editor who can read `posts` only, so any `authors` widget is locked for them. */
const EDITOR_WITHOUT_AUTHORS: EffectivePermissions = buildEffectivePermissions(
  [assignment(ROLE_EDITOR, '*'), assignment(ROLE_POSTS_READER, 'posts')],
  [role(ROLE_EDITOR, ['manage_layout']), role(ROLE_POSTS_READER, ['content:read'])],
)

const VISIBLE_WIDGET: DashboardWidgetInstance = { id: 'w-visible', type: 'core/text', config: {} }
const LOCKED_WIDGET: DashboardWidgetInstance = {
  id: 'w-locked',
  type: '@acme/stored-chart',
  title: 'Stored authors chart',
  config: { seedSlug: 'authors', variant: 'bars' },
}
const PLACEHOLDER: DashboardWidgetInstance = { id: 'w-locked', type: LOCKED_WIDGET_TYPE, config: {} }

function pageOf(slug: string, columns: DashboardWidgetInstance[][], overrides: Partial<DashboardPageLayout> = {}): DashboardPageLayout {
  return {
    id: `page-${slug}`,
    slug,
    label: slug,
    sections: [{ id: `section-${slug}`, columns: columns.map((widgets, index) => ({ id: `col-${slug}-${index}`, widgets })) }],
    ...overrides,
  }
}

function layoutOf(...pages: DashboardPageLayout[]): DashboardLayout {
  return { version: 1, pages }
}

function storedLayout(): DashboardLayout {
  return layoutOf(pageOf('overview', [[VISIBLE_WIDGET, LOCKED_WIDGET], []]), pageOf('team', [[]]))
}

describe('hasDashboardLayoutStructuralChange', () => {
  it('returns false when only sections differ', () => {
    const stored = storedLayout()
    const next = layoutOf(pageOf('overview', [[{ ...VISIBLE_WIDGET, title: 'Renamed' }], [PLACEHOLDER]]), pageOf('team', [[VISIBLE_WIDGET]]))

    const changed = hasDashboardLayoutStructuralChange(stored, next)

    expect(changed).toBe(false)
  })

  it('returns true for any save over a null stored layout', () => {
    const next = storedLayout()

    const changed = hasDashboardLayoutStructuralChange(null, next)

    expect(changed).toBe(true)
  })

  it('returns true for an added tab, a removed tab and a swapped tab order', () => {
    const stored = storedLayout()
    const [overview, team] = stored.pages as [DashboardPageLayout, DashboardPageLayout]
    const variants = {
      added: layoutOf(overview, team, pageOf('extra', [[]])),
      removed: layoutOf(overview),
      swapped: layoutOf(team, overview),
    }

    const changed = Object.values(variants).map((next) => hasDashboardLayoutStructuralChange(stored, next))

    expect(changed).toEqual([true, true, true])
  })

  it('returns true for a changed slug, label, icon or roles', () => {
    const stored = storedLayout()
    const [overview, team] = stored.pages as [DashboardPageLayout, DashboardPageLayout]
    const variants = [
      { slug: 'renamed' },
      { label: 'Renamed' },
      { icon: 'star' },
      { roles: [ROLE_AUDIENCE] },
    ].map((overrides) => layoutOf({ ...overview, ...overrides }, team))

    const changed = variants.map((next) => hasDashboardLayoutStructuralChange(stored, next))

    expect(changed).toEqual([true, true, true, true])
  })

  it('treats an absent roles and roles: [] as equal', () => {
    const stored = storedLayout()
    const [overview, team] = stored.pages as [DashboardPageLayout, DashboardPageLayout]
    const next = layoutOf({ ...overview, roles: [] }, team)

    const changed = hasDashboardLayoutStructuralChange(stored, next)

    expect(changed).toBe(false)
  })
})

describe('reconcileLockedWidgets', () => {
  it('replaces a placeholder sent back in its column with the stored widget verbatim', () => {
    const stored = storedLayout()
    const next = layoutOf(pageOf('overview', [[VISIBLE_WIDGET, PLACEHOLDER], []]), pageOf('team', [[]]))

    const result = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)

    expect(result).toEqual({ ok: true, layout: stored })
  })

  it('accepts a locked widget whose index shifted inside its own column', () => {
    const stored = storedLayout()
    const next = layoutOf(pageOf('overview', [[PLACEHOLDER, VISIBLE_WIDGET], []]), pageOf('team', [[]]))

    const result = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)

    expect(result).toEqual({
      ok: true,
      layout: layoutOf(pageOf('overview', [[LOCKED_WIDGET, VISIBLE_WIDGET], []]), pageOf('team', [[]])),
    })
  })

  it('refuses a locked widget sent in another column, naming only its id', () => {
    const stored = storedLayout()
    const next = layoutOf(pageOf('overview', [[VISIBLE_WIDGET], [PLACEHOLDER]]), pageOf('team', [[]]))

    const result = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)

    expect(result).toEqual({ ok: false, errors: ["Widget 'w-locked' is locked and cannot be moved."] })
  })

  it('refuses a layout that drops a locked widget while its tab survives', () => {
    const stored = storedLayout()
    const widgetRemoved = layoutOf(pageOf('overview', [[VISIBLE_WIDGET], []]), pageOf('team', [[]]))
    const sectionRemoved = layoutOf(pageOf('overview', [], { sections: [] }), pageOf('team', [[]]))

    const results = [widgetRemoved, sectionRemoved].map((next) => reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS))

    expect(results).toEqual([
      { ok: false, errors: ["Widget 'w-locked' is locked and cannot be removed."] },
      { ok: false, errors: ["Widget 'w-locked' is locked and cannot be removed."] },
    ])
  })

  it('drops silently the locked widgets of a tab absent from next', () => {
    const stored = storedLayout()
    const next = layoutOf(pageOf('team', [[]]))

    const result = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)

    expect(result).toEqual({ ok: true, layout: next })
  })

  it('refuses a forged core/locked widget whose id is not locked in stored', () => {
    const stored = storedLayout()
    const forged: DashboardWidgetInstance = { id: 'w-forged', type: LOCKED_WIDGET_TYPE, config: {} }
    const next = layoutOf(pageOf('overview', [[VISIBLE_WIDGET, PLACEHOLDER, forged], []]), pageOf('team', [[]]))

    const result = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)

    expect(result).toEqual({ ok: false, errors: ["Widget 'w-forged' is not usable by the caller."] })
  })

  it('refuses a new widget bound to an unreadable seed and a stored usable widget re-bound to one', () => {
    const stored = storedLayout()
    const newUnreadable: DashboardWidgetInstance = { id: 'w-new', type: 'core/text', config: { seedSlug: 'authors' } }
    const reBound: DashboardWidgetInstance = { ...VISIBLE_WIDGET, config: { seedSlug: 'authors' } }
    const variants = [
      { widget: newUnreadable, next: [VISIBLE_WIDGET, PLACEHOLDER, newUnreadable] },
      { widget: reBound, next: [reBound, PLACEHOLDER] },
    ]

    const results = variants.map(({ next }) =>
      reconcileLockedWidgets(stored, layoutOf(pageOf('overview', [next, []]), pageOf('team', [[]])), EDITOR_WITHOUT_AUTHORS),
    )

    expect(results).toEqual(
      variants.map(({ widget }) => ({ ok: false, errors: [`Widget '${widget.id}' is not usable by the caller.`] })),
    )
  })

  it('returns next unchanged when stored is null and every widget is usable', () => {
    const next = storedLayout()
    next.pages[0]!.sections[0]!.columns[0]!.widgets = [VISIBLE_WIDGET]

    const result = reconcileLockedWidgets(null, next, EDITOR_WITHOUT_AUTHORS)

    expect(result).toEqual({ ok: true, layout: next })
  })

  it('writes no stored widget type, title or seed slug into any error string', () => {
    const stored = storedLayout()
    const next = layoutOf(pageOf('overview', [[VISIBLE_WIDGET], [{ ...PLACEHOLDER, id: 'w-forged' }]]), pageOf('team', [[]]))

    const result = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)

    const messages = JSON.stringify(result)
    expect(messages).toContain('w-locked')
    expect(messages).not.toContain('@acme/stored-chart')
    expect(messages).not.toContain('Stored authors chart')
    expect(messages).not.toContain('authors')
  })

  it('never mutates its inputs and returns deep-equal results for the same inputs twice', () => {
    const stored = storedLayout()
    const next = layoutOf(pageOf('overview', [[PLACEHOLDER, VISIBLE_WIDGET], []]), pageOf('team', [[]]))
    const storedBefore = structuredClone(stored)
    const nextBefore = structuredClone(next)

    const first = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)
    const second = reconcileLockedWidgets(stored, next, EDITOR_WITHOUT_AUTHORS)

    expect(second).toEqual(first)
    expect(stored).toEqual(storedBefore)
    expect(next).toEqual(nextBefore)
  })
})
