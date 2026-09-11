// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "@/lib/api"
import type {
  AccountView, AssignmentView, CreateAssignmentPayload, CreateInvitationPayload,
  CreateUserPayload, InvitationView, RoleBodyPayload, RoleRecord,
} from "../types/rbac.types"

export const rbacApi = {
  listUsers: async (): Promise<AccountView[]> =>
    (await api.get<{ users: AccountView[] }>("/rbac/users")).data.users,

  createUser: async (payload: CreateUserPayload): Promise<AccountView> =>
    (await api.post<AccountView>("/rbac/users", payload)).data,

  setUserActive: async (userId: string, isActive: boolean): Promise<void> => {
    await api.patch(`/rbac/users/${userId}/active`, { isActive })
  },

  listAssignments: async (userId: string): Promise<AssignmentView[]> =>
    (await api.get<{ assignments: AssignmentView[] }>(`/rbac/users/${userId}/assignments`)).data.assignments,

  createAssignment: async (payload: CreateAssignmentPayload): Promise<{ id: string }> =>
    (await api.post<{ id: string }>("/rbac/assignments", payload)).data,

  deleteAssignment: async (assignmentId: string): Promise<void> => {
    await api.delete(`/rbac/assignments/${assignmentId}`)
  },

  listRoles: async (): Promise<RoleRecord[]> =>
    (await api.get<{ roles: RoleRecord[] }>("/rbac/roles")).data.roles,

  createRole: async (payload: RoleBodyPayload): Promise<{ id: string }> =>
    (await api.post<{ id: string }>("/rbac/roles", payload)).data,

  updateRole: async (roleId: string, payload: RoleBodyPayload): Promise<void> => {
    await api.put(`/rbac/roles/${roleId}`, payload)
  },

  deleteRole: async (roleId: string): Promise<void> => {
    await api.delete(`/rbac/roles/${roleId}`)
  },

  listInvitations: async (): Promise<InvitationView[]> =>
    (await api.get<{ invitations: InvitationView[] }>("/rbac/invitations")).data.invitations,

  createInvitation: async (payload: CreateInvitationPayload): Promise<{ id: string; expiresAt: number; inviteUrl: string }> =>
    (await api.post<{ id: string; expiresAt: number; inviteUrl: string }>("/rbac/invitations", payload)).data,

  regenerateInvitation: async (invitationId: string): Promise<{ id: string; expiresAt: number; inviteUrl: string }> =>
    (await api.post<{ id: string; expiresAt: number; inviteUrl: string }>(`/rbac/invitations/${invitationId}/regenerate`, {})).data,

  revokeInvitation: async (invitationId: string): Promise<void> => {
    await api.delete(`/rbac/invitations/${invitationId}`)
  },
}
