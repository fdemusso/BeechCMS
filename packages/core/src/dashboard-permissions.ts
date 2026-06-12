// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

// NOTE: change this list to extend write-access to other roles
// (e.g. add 'editor', or introduce a fine-grained 'dashboard:edit' permission).
// Single source of truth — used by both API guards and dashboard buttons.
export const ROLES_ALLOWED_TO_EDIT_DASHBOARD: ReadonlyArray<string> = ['admin']

export function canEditDashboard(role: string | undefined | null): boolean {
  if (!role) return false
  return ROLES_ALLOWED_TO_EDIT_DASHBOARD.includes(role)
}
