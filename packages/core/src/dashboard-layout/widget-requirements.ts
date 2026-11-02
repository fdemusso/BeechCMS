// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { GLOBAL_SCOPE, type Permission } from '../rbac/permissions.js'
import { hasPermission, hasPermissionAnywhere } from '../rbac/evaluate.js'
import type { EffectivePermissions } from '../rbac/types.js'
import type {
  DashboardColumn,
  DashboardLayout,
  DashboardPageLayout,
  DashboardSection,
  DashboardWidgetInstance,
} from './dashboard-layout.js'

/** What a widget needs to be usable. Absent = usable by every caller. */
export type WidgetRequirement =
  /** `permission` held at the global scope (`'*'`). */
  | { readonly kind: 'global-permission'; readonly permission: Permission }
  /** `content:read` on `config.seedSlug`; a config naming no seed needs `content:read` on at least one seed. */
  | { readonly kind: 'seed-read' }
  /** `content:read` on at least one scope. */
  | { readonly kind: 'any-seed-read' }

/** Resolves the requirement of one placed widget; undefined = no requirement. */
export type WidgetRequirementLookup = (
  widget: Pick<DashboardWidgetInstance, 'type' | 'config'>,
) => WidgetRequirement | undefined

/**
 * Whether `permissions` satisfies `requirement` for a widget carrying `config`.
 * Cosmetic gate only: the widget's data routes remain the enforcement point. Never throws.
 */
export function isWidgetRequirementMet(
  requirement: WidgetRequirement | undefined,
  permissions: EffectivePermissions,
  config: Readonly<Record<string, unknown>>,
): boolean {
  if (requirement === undefined) return true

  switch (requirement.kind) {
    case 'global-permission':
      return hasPermission(permissions, requirement.permission, GLOBAL_SCOPE)
    case 'seed-read': {
      const seedSlug = config['seedSlug']
      if (typeof seedSlug === 'string' && seedSlug !== '') {
        return hasPermission(permissions, 'content:read', seedSlug)
      }
      return hasPermissionAnywhere(permissions, 'content:read')
    }
    case 'any-seed-read':
      return hasPermissionAnywhere(permissions, 'content:read')
  }
}

const SEED_READ: WidgetRequirement = { kind: 'seed-read' }
const ANY_SEED_READ: WidgetRequirement = { kind: 'any-seed-read' }
const globalPermission = (permission: Permission): WidgetRequirement => ({ kind: 'global-permission', permission })

const STATIC_CORE_REQUIREMENTS: ReadonlyMap<string, WidgetRequirement> = new Map([
  ['core/setup-checklist', globalPermission('manage_users')],
  ['core/system-health', globalPermission('view_analytics')],
  ['core/site-status', globalPermission('view_analytics')],
  ['core/storage', globalPermission('view_analytics')],
  ['core/media-gallery', globalPermission('content:read')],
  ['core/line-chart', SEED_READ],
  ['core/bar-chart', SEED_READ],
  ['core/area-chart', SEED_READ],
  ['core/pie-chart', SEED_READ],
  ['core/data-table', SEED_READ],
  ['core/recent-content', SEED_READ],
  ['core/pending-drafts', SEED_READ],
  ['core/activity-feed', SEED_READ],
  ['core/publication-stats', ANY_SEED_READ],
  ['core/content-pulse', ANY_SEED_READ],
  ['core/recent-activity', ANY_SEED_READ],
  ['core/quick-draft', ANY_SEED_READ],
])

const CLOUDFLARE_STAT_KEYS: ReadonlySet<unknown> = new Set(['visitors', 'traffic', 'storage'])

/** `core/stat` reads a seed, Cloudflare analytics or the site total; `seedSlug` wins over `statKey`. */
function resolveStatRequirement(config: Readonly<Record<string, unknown>>): WidgetRequirement {
  const seedSlug = config['seedSlug']
  if (typeof seedSlug === 'string' && seedSlug !== '') return SEED_READ
  if (CLOUDFLARE_STAT_KEYS.has(config['statKey'])) return globalPermission('view_analytics')
  return ANY_SEED_READ
}

/** The requirement of a built-in `core/` widget. Undefined for any other type. */
export const resolveCoreWidgetRequirement: WidgetRequirementLookup = (widget) => {
  if (widget.type === 'core/stat') return resolveStatRequirement(widget.config ?? {})
  return STATIC_CORE_REQUIREMENTS.get(widget.type)
}

/** Type of the opaque stand-in a layout editor receives for a widget they cannot use. Never persisted. */
export const LOCKED_WIDGET_TYPE = 'core/locked'

/**
 * Whether `permissions` cannot use `widget`, as far as the server can tell: it is a placeholder, its
 * `config.seedSlug` names a seed they may not `content:read`, or it is a built-in whose core requirement
 * is unmet. A custom widget's own `requires` is invisible to the Worker and never locks it here.
 */
export function isWidgetLockedFor(
  widget: Pick<DashboardWidgetInstance, 'type' | 'config'>,
  permissions: EffectivePermissions,
): boolean {
  if (widget.type === LOCKED_WIDGET_TYPE) return true

  const config = widget.config ?? {}
  const seedSlug = config['seedSlug']
  if (typeof seedSlug === 'string' && seedSlug !== '' && !hasPermission(permissions, 'content:read', seedSlug)) {
    return true
  }

  return !isWidgetRequirementMet(resolveCoreWidgetRequirement(widget), permissions, config)
}

/** Removes the widgets `permissions` cannot use, then the sections and pages that removal emptied. */
export function filterDashboardLayoutByWidgetRequirements(
  layout: DashboardLayout,
  permissions: EffectivePermissions,
  requirementOf: WidgetRequirementLookup,
): DashboardLayout {
  const filterColumn = (column: DashboardColumn): DashboardColumn => ({
    ...column,
    widgets: column.widgets.filter(
      (widget) =>
        widget.type !== LOCKED_WIDGET_TYPE &&
        isWidgetRequirementMet(requirementOf(widget), permissions, widget.config ?? {}),
    ),
  })

  const countWidgets = (section: DashboardSection): number =>
    section.columns.reduce((total, column) => total + column.widgets.length, 0)

  const filterPage = (page: DashboardPageLayout): DashboardPageLayout => {
    const sections = page.sections
      .map((section) => ({ before: countWidgets(section), section: { ...section, columns: section.columns.map(filterColumn) } }))
      .filter(({ before, section }) => before === 0 || countWidgets(section) > 0)
      .map(({ section }) => section)
    return { ...page, sections }
  }

  const pages = layout.pages
    .map((page) => ({ hadSections: page.sections.length > 0, page: filterPage(page) }))
    .filter(({ hadSections, page }) => !hadSections || page.sections.length > 0)
    .map(({ page }) => page)

  return { ...layout, pages }
}
