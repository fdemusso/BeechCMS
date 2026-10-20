// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "@/lib/api"
import type {
  AccountView, AssignmentView, CreateAssignmentPayload, CreateInvitationPayload,
  CreateUserPayload, InvitationView, RoleBodyPayload, RoleRecord,
} from "../types/rbac.types"

/** Matches the API's largest page (`MAX_PAGE_SIZE`): fewest round trips per listing. */
const PAGE_SIZE = 100

/**
 * The admin listings are paged server-side so one request never loads a whole table.
 * The dashboard still shows everything, so it walks the pages until `nextOffset` is null.
 */
type Page<K extends string, T> = Record<K, T[]> & { nextOffset: number | null }

async function listAllPages<K extends string, T>(path: string, key: K): Promise<T[]> {
  const rows: T[] = []
  let offset: number | null = 0
  while (offset !== null) {
    const { data }: { data: Page<K, T> } = await api.get<Page<K, T>>(path, {
      params: { limit: PAGE_SIZE, offset },
    })
    rows.push(...data[key])
    offset = data.nextOffset
  }
  return rows
}

export const rbacApi = {
  listUsers: (): Promise<AccountView[]> => listAllPages<"users", AccountView>("/rbac/users", "users"),

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

  listInvitations: (): Promise<InvitationView[]> =>
    listAllPages<"invitations", InvitationView>("/rbac/invitations", "invitations"),

  createInvitation: async (payload: CreateInvitationPayload): Promise<{ id: string; expiresAt: number; inviteUrl: string }> =>
    (await api.post<{ id: string; expiresAt: number; inviteUrl: string }>("/rbac/invitations", payload)).data,

  regenerateInvitation: async (invitationId: string): Promise<{ id: string; expiresAt: number; inviteUrl: string }> =>
    (await api.post<{ id: string; expiresAt: number; inviteUrl: string }>(`/rbac/invitations/${invitationId}/regenerate`, {})).data,

  revokeInvitation: async (invitationId: string): Promise<void> => {
    await api.delete(`/rbac/invitations/${invitationId}`)
  },
}
