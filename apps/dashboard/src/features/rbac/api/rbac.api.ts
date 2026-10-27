// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from "@/lib/rpc"
import type { AccountView, AssignmentView, InvitationView, RoleRecord } from "../types/rbac.types"
import type {
  CreateAssignmentPayload, CreateInvitationPayload, CreateUserPayload, RoleBodyPayload,
} from "../types/rbac.types"

/** Matches the API's largest page (`MAX_PAGE_SIZE`): fewest round trips per listing. */
const PAGE_SIZE = 100

type Page<Row> = { rows: Row[]; nextOffset: number | null }

/**
 * The admin listings are paged server-side so one request never loads a whole table.
 * The dashboard still shows everything, so it walks the pages until `nextOffset` is null.
 */
async function walkPages<Row>(fetchPage: (query: { limit: string; offset: string }) => Promise<Page<Row>>): Promise<Row[]> {
  const rows: Row[] = []
  let offset: number | null = 0
  while (offset !== null) {
    const page: Page<Row> = await fetchPage({ limit: String(PAGE_SIZE), offset: String(offset) })
    rows.push(...page.rows)
    offset = page.nextOffset
  }
  return rows
}

export const rbacApi = {
  listUsers: (): Promise<AccountView[]> =>
    walkPages(async (query) => {
      const { users, nextOffset } = await (await rpc.api.rbac.users.$get({ query })).json()
      return { rows: users, nextOffset }
    }),

  createUser: async (payload: CreateUserPayload): Promise<AccountView> => {
    const response = await rpc.api.rbac.users.$post({ json: payload })
    return response.json()
  },

  setUserActive: async (userId: string, isActive: boolean): Promise<void> => {
    await rpc.api.rbac.users[":userId"].active.$patch({ param: { userId }, json: { isActive } })
  },

  listAssignments: async (userId: string): Promise<AssignmentView[]> => {
    const response = await rpc.api.rbac.users[":userId"].assignments.$get({ param: { userId } })
    return (await response.json()).assignments
  },

  createAssignment: async (payload: CreateAssignmentPayload): Promise<{ id: string }> => {
    const response = await rpc.api.rbac.assignments.$post({ json: payload })
    return response.json()
  },

  deleteAssignment: async (assignmentId: string): Promise<void> => {
    await rpc.api.rbac.assignments[":assignmentId"].$delete({ param: { assignmentId } })
  },

  listRoles: async (): Promise<RoleRecord[]> => {
    const response = await rpc.api.rbac.roles.$get()
    return (await response.json()).roles
  },

  createRole: async (payload: RoleBodyPayload): Promise<{ id: string }> => {
    const response = await rpc.api.rbac.roles.$post({ json: payload })
    return response.json()
  },

  updateRole: async (roleId: string, payload: RoleBodyPayload): Promise<void> => {
    await rpc.api.rbac.roles[":roleId"].$put({ param: { roleId }, json: payload })
  },

  deleteRole: async (roleId: string): Promise<void> => {
    await rpc.api.rbac.roles[":roleId"].$delete({ param: { roleId } })
  },

  listInvitations: (): Promise<InvitationView[]> =>
    walkPages(async (query) => {
      const { invitations, nextOffset } = await (await rpc.api.rbac.invitations.$get({ query })).json()
      return { rows: invitations, nextOffset }
    }),

  createInvitation: async (payload: CreateInvitationPayload): Promise<{ id: string; expiresAt: number; inviteUrl: string }> => {
    const response = await rpc.api.rbac.invitations.$post({ json: payload })
    return response.json()
  },

  regenerateInvitation: async (invitationId: string): Promise<{ id: string; expiresAt: number; inviteUrl: string }> => {
    const response = await rpc.api.rbac.invitations[":invitationId"].regenerate.$post({ param: { invitationId } })
    return response.json()
  },

  revokeInvitation: async (invitationId: string): Promise<void> => {
    await rpc.api.rbac.invitations[":invitationId"].$delete({ param: { invitationId } })
  },
}
