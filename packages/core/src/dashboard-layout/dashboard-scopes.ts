// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

// ---------------------------------------------------------------------------
// Dashboard layout scopes (Sprint 06: role-based dashboards)
// ---------------------------------------------------------------------------

/** Roles that may have their own dashboard layout. Single source of truth —
 *  extend this list if a new role is introduced. */
export const KNOWN_DASHBOARD_ROLES: ReadonlyArray<string> = ['admin', 'editor']

export const DEFAULT_DASHBOARD_SCOPE = 'default'

/** Builds the per-role scope string, e.g. `roleScope('editor') === 'role:editor'`. */
export function roleScope(role: string): string {
  return `role:${role}`
}

/** Whether `scope` is one of the closed set: `'default' | 'role:<known role>'`. */
export function isValidDashboardScope(scope: string): boolean {
  if (scope === DEFAULT_DASHBOARD_SCOPE) return true
  const match = /^role:(.+)$/.exec(scope)
  if (!match) return false
  return KNOWN_DASHBOARD_ROLES.includes(match[1])
}

/** Read-resolution order for a caller's role: `['role:<role>', 'default']`,
 *  or just `['default']` for unknown/missing roles. */
export function resolveDashboardScopeChain(role: string | undefined | null): string[] {
  if (role && KNOWN_DASHBOARD_ROLES.includes(role)) {
    return [roleScope(role), DEFAULT_DASHBOARD_SCOPE]
  }
  return [DEFAULT_DASHBOARD_SCOPE]
}
