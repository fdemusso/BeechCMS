// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

// NOTE: change this list to extend write-access to other roles
// (e.g. add 'editor', or introduce a fine-grained 'layout:edit' permission).
// Single source of truth — used by both API guards and dashboard buttons.
export const ROLES_ALLOWED_TO_EDIT_LAYOUT: ReadonlyArray<string> = ['admin']

export function canEditLayout(role: string | undefined | null): boolean {
  if (!role) return false
  return ROLES_ALLOWED_TO_EDIT_LAYOUT.includes(role)
}
