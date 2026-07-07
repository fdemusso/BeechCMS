// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

/** Views that can be authorized on a seed. Only rendered views (grid/chart excluded — unrendered). */
export type DashboardView = 'table' | 'gallery' | 'kanban'

/** Order drives ViewSwitcher tab order. */
export const AUTHORIZABLE_VIEWS: readonly DashboardView[] = ['table', 'gallery', 'kanban'] as const

/** Applied to seeds with no explicit `dashboard.views` (backward compatibility). */
export const DEFAULT_AUTHORIZED_VIEWS: readonly DashboardView[] = ['table'] as const

const VALID = new Set<DashboardView>(AUTHORIZABLE_VIEWS)

/**
 * Resolves the effective, deduplicated, canonically-ordered authorized views for a seed.
 * Invariants:
 *  - 'table' is ALWAYS present (universal fallback — relational backing).
 *  - Unknown/legacy values are stripped.
 *  - Empty/undefined config → DEFAULT_AUTHORIZED_VIEWS (then table-guaranteed).
 */
export function resolveAuthorizedViews(seed: Pick<Seed, 'dashboard'>): DashboardView[] {
  const raw = seed.dashboard?.views
  const source = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_AUTHORIZED_VIEWS
  const allowed = new Set<DashboardView>()
  for (const v of source) if (VALID.has(v as DashboardView)) allowed.add(v as DashboardView)
  allowed.add('table')
  return AUTHORIZABLE_VIEWS.filter((v) => allowed.has(v))
}

/** URL-guard helper: is `view` authorized for this seed? */
export function isViewAuthorized(seed: Pick<Seed, 'dashboard'>, view: string): view is DashboardView {
  return VALID.has(view as DashboardView) && resolveAuthorizedViews(seed).includes(view as DashboardView)
}
