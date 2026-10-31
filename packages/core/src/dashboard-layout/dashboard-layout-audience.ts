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
} from './dashboard-layout.js'

/** Who is looking at the dashboard, as resolved for one request. */
export interface DashboardLayoutViewer {
  /** Ids of the roles the caller holds through at least one active (decay-filtered) assignment, at any scope. */
  readonly roleIds: ReadonlySet<string>
  /** The caller's effective authority. */
  readonly permissions: EffectivePermissions
}

export interface FilteredDashboardLayout {
  readonly layout: DashboardLayout
  /** Widgets removed because their `config.seedSlug` names a seed the viewer may not `content:read`. */
  readonly hiddenWidgetCount: number
}

/**
 * The part of a layout one viewer may receive. The layout is never the authority: this
 * projection is applied by the server before serving, and data routes enforce RBAC on their own.
 */
export function filterDashboardLayoutForViewer(
  layout: DashboardLayout,
  viewer: DashboardLayoutViewer,
): FilteredDashboardLayout {
  const seesAllTabs = hasPermission(viewer.permissions, 'manage_roles', GLOBAL_SCOPE)
  let hiddenWidgetCount = 0

  const isInAudience = (page: DashboardPageLayout): boolean =>
    seesAllTabs || !page.roles?.length || page.roles.some((roleId) => viewer.roleIds.has(roleId))

  const filterColumn = (column: DashboardColumn): DashboardColumn => ({
    ...column,
    widgets: column.widgets.filter((widget) => {
      const seedSlug = widget.config?.['seedSlug']
      if (typeof seedSlug !== 'string' || seedSlug === '') return true
      if (hasPermission(viewer.permissions, 'content:read', seedSlug)) return true
      hiddenWidgetCount++
      return false
    }),
  })

  const filterPage = (page: DashboardPageLayout): DashboardPageLayout => {
    const filteredSections: DashboardSection[] = page.sections.map((section) => ({
      ...section,
      columns: section.columns.map(filterColumn),
    }))
    if (seesAllTabs) return { ...page, sections: filteredSections }

    const sections = filteredSections.filter((section) => section.columns.some((column) => column.widgets.length > 0))
    const readerPage: DashboardPageLayout = { ...page, sections }
    delete readerPage.roles
    return readerPage
  }

  const pages = layout.pages
    .filter(isInAudience)
    .map(filterPage)
    .filter((page) => seesAllTabs || page.sections.length > 0)

  return { layout: { ...layout, pages }, hiddenWidgetCount }
}
