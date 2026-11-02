// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { EffectivePermissions } from '../rbac/types.js'
import type { DashboardLayout, DashboardPageLayout, DashboardWidgetInstance } from './dashboard-layout.js'
import { isWidgetLockedFor } from './widget-requirements.js'

/**
 * Whether `next` changes anything a `manage_layout`-only editor may not change: the tab set, their order,
 * or a tab's `id`, `slug`, `label`, `icon` or `roles`. Only `sections` are content. With nothing stored,
 * every save is structural (creating tabs is structural).
 */
export function hasDashboardLayoutStructuralChange(stored: DashboardLayout | null, next: DashboardLayout): boolean {
  if (stored === null) return true
  if (stored.pages.length !== next.pages.length) return true

  return stored.pages.some((storedPage, index) => {
    const nextPage = next.pages[index]!
    return (
      storedPage.id !== nextPage.id ||
      storedPage.slug !== nextPage.slug ||
      storedPage.label !== nextPage.label ||
      storedPage.icon !== nextPage.icon ||
      !haveSameRoles(storedPage.roles ?? [], nextPage.roles ?? [])
    )
  })
}

function haveSameRoles(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((roleId, index) => roleId === right[index])
}

export type LockedWidgetReconciliation =
  | { readonly ok: true; readonly layout: DashboardLayout }
  | { readonly ok: false; readonly errors: readonly string[] }

interface LockedWidgetEntry {
  readonly widget: DashboardWidgetInstance
  readonly pageId: string
  readonly sectionId: string
  readonly columnId: string
}

/**
 * The layout to persist from what an editor sent. Each widget of `stored` that `permissions` cannot use
 * (`isWidgetLockedFor`) is taken back verbatim from `stored`; the client is never trusted on it.
 */
export function reconcileLockedWidgets(
  stored: DashboardLayout | null,
  next: DashboardLayout,
  permissions: EffectivePermissions,
): LockedWidgetReconciliation {
  const lockedById = collectLockedWidgets(stored, permissions)
  const seenLockedIds = new Set<string>()
  const errors: string[] = []

  const pages: DashboardPageLayout[] = next.pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        widgets: column.widgets.flatMap((widget): DashboardWidgetInstance[] => {
          const locked = lockedById.get(widget.id)
          if (locked === undefined) {
            if (!isWidgetLockedFor(widget, permissions)) return [widget]
            errors.push(`Widget '${widget.id}' is not usable by the caller.`)
            return []
          }

          seenLockedIds.add(widget.id)
          const sameLocation =
            locked.pageId === page.id && locked.sectionId === section.id && locked.columnId === column.id
          if (!sameLocation) {
            errors.push(`Widget '${widget.id}' is locked and cannot be moved.`)
            return []
          }

          return [locked.widget]
        }),
      })),
    })),
  }))

  const nextPageIds = new Set(next.pages.map((page) => page.id))
  for (const [widgetId, locked] of lockedById) {
    if (seenLockedIds.has(widgetId) || !nextPageIds.has(locked.pageId)) continue
    errors.push(`Widget '${widgetId}' is locked and cannot be removed.`)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, layout: { ...next, pages } }
}

function collectLockedWidgets(
  stored: DashboardLayout | null,
  permissions: EffectivePermissions,
): ReadonlyMap<string, LockedWidgetEntry> {
  const lockedById = new Map<string, LockedWidgetEntry>()
  for (const page of stored?.pages ?? []) {
    for (const section of page.sections) {
      for (const column of section.columns) {
        for (const widget of column.widgets) {
          if (isWidgetLockedFor(widget, permissions)) {
            lockedById.set(widget.id, { widget, pageId: page.id, sectionId: section.id, columnId: column.id })
          }
        }
      }
    }
  }
  return lockedById
}
