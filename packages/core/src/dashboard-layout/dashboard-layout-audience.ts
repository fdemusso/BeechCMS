// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { GLOBAL_SCOPE } from '../rbac/permissions.js'
import { hasPermission } from '../rbac/evaluate.js'
import type { EffectivePermissions } from '../rbac/types.js'
import type {
  DashboardColumn,
  DashboardLayout,
  DashboardPageLayout,
  DashboardSection,
  DashboardWidgetInstance,
} from './dashboard-layout.js'
import { isWidgetLockedFor, LOCKED_WIDGET_TYPE } from './widget-requirements.js'

/** Who is looking at the dashboard, as resolved for one request. */
export interface DashboardLayoutViewer {
  /** Ids of the roles the caller holds through at least one active (decay-filtered) assignment, at any scope. */
  readonly roleIds: ReadonlySet<string>
  /** The caller's effective authority. */
  readonly permissions: EffectivePermissions
}

/** Whether the caller edits the dashboard layout: `manage_layout` or `manage_roles`, held at the global scope. */
export function isDashboardLayoutEditor(permissions: EffectivePermissions): boolean {
  return hasPermission(permissions, 'manage_layout', GLOBAL_SCOPE) || hasPermission(permissions, 'manage_roles', GLOBAL_SCOPE)
}

export interface FilteredDashboardLayout {
  readonly layout: DashboardLayout
}

/**
 * The part of a layout one viewer may receive. The layout is never the authority: this
 * projection is applied by the server before serving, and data routes enforce RBAC on their own.
 *
 * An editor receives the real structure, with every widget they cannot use swapped in place for an
 * opaque {@link LOCKED_WIDGET_TYPE} placeholder. A reader never learns that such widgets exist.
 */
export function filterDashboardLayoutForViewer(
  layout: DashboardLayout,
  viewer: DashboardLayoutViewer,
): FilteredDashboardLayout {
  const editor = isDashboardLayoutEditor(viewer.permissions)

  const isInAudience = (page: DashboardPageLayout): boolean =>
    editor || !page.roles?.length || page.roles.some((roleId) => viewer.roleIds.has(roleId))

  const toPlaceholder = (widget: DashboardWidgetInstance): DashboardWidgetInstance => ({
    id: widget.id,
    type: LOCKED_WIDGET_TYPE,
    config: {},
  })

  const filterColumn = (column: DashboardColumn): DashboardColumn => ({
    ...column,
    widgets: editor
      ? column.widgets.map((widget) => (isWidgetLockedFor(widget, viewer.permissions) ? toPlaceholder(widget) : widget))
      : column.widgets.filter((widget) => !isWidgetLockedFor(widget, viewer.permissions)),
  })

  const filterPage = (page: DashboardPageLayout): DashboardPageLayout => {
    const filteredSections: DashboardSection[] = page.sections.map((section) => ({
      ...section,
      columns: section.columns.map(filterColumn),
    }))
    if (editor) return { ...page, sections: filteredSections }

    const sections = filteredSections.filter((section) => section.columns.some((column) => column.widgets.length > 0))
    const readerPage: DashboardPageLayout = { ...page, sections }
    delete readerPage.roles
    return readerPage
  }

  const pages = layout.pages
    .filter(isInAudience)
    .map(filterPage)
    .filter((page) => editor || page.sections.length > 0)

  return { layout: { ...layout, pages } }
}
