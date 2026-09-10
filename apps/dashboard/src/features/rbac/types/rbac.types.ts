// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AccountSummary, Permission, PermissionAssignment, RoleRecord, Scope } from "@beechcms/core"

export type { Permission, RoleRecord, Scope }

/** `GET /api/rbac/users` row: account + its RAW (non-decayed) assignments. */
export type AccountView = AccountSummary & { assignments: PermissionAssignment[] }

/** `GET /api/rbac/users/:id/assignments` row. `active: false` = the scope's seed is
 *  currently deleted/inactive: the row still exists and must stay removable. */
export type AssignmentView = PermissionAssignment & {
  active: boolean
  roleName: string | null
  permissions: Permission[]
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired'

export interface InvitationView {
  id: string
  email: string
  roleId: string
  roleName: string | null
  scope: Scope
  invitedBy: string
  expiresAt: number
  createdAt: number
  status: InvitationStatus
}

export interface CreateUserPayload {
  email: string
  password: string
  name?: string | null
  surname?: string | null
}

export interface RoleBodyPayload {
  name: string
  description?: string | null
  permissions: Permission[]   // min 1 — server rejects an empty array (422)
}

export interface CreateAssignmentPayload { userId: string; roleId: string; scope: Scope }
export interface CreateInvitationPayload { email: string; roleId: string; scope: Scope; locale?: string }
