// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ME_QUERY_KEY } from "@/features/shared"
import { rbacApi } from "../api/rbac.api"
import type { CreateAssignmentPayload, CreateInvitationPayload, CreateUserPayload, RoleBodyPayload } from "../types/rbac.types"

export const RBAC_QUERY_KEYS = {
  all: ["rbac"] as const,
  users: () => [...RBAC_QUERY_KEYS.all, "users"] as const,
  assignments: (userId: string) => [...RBAC_QUERY_KEYS.all, "assignments", userId] as const,
  roles: () => [...RBAC_QUERY_KEYS.all, "roles"] as const,
  invitations: () => [...RBAC_QUERY_KEYS.all, "invitations"] as const,
}

export function useRbacUsers() {
  return useQuery({
    queryKey: RBAC_QUERY_KEYS.users(),
    queryFn: rbacApi.listUsers,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => rbacApi.createUser(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.users() }),
  })
}

export function useSetUserActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      rbacApi.setUserActive(userId, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.users() }),
  })
}

export function useUserAssignments(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: RBAC_QUERY_KEYS.assignments(userId),
    queryFn: () => rbacApi.listAssignments(userId),
    enabled: enabled && !!userId,
  })
}

/** Self-authority refresh: an operator editing their own assignments must see their
 *  own chrome update without a reload. */
export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAssignmentPayload) => rbacApi.createAssignment(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.assignments(variables.userId) })
      qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.users() })
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY })
    },
  })
}

export function useDeleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId }: { assignmentId: string; userId: string }) =>
      rbacApi.deleteAssignment(assignmentId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.assignments(variables.userId) })
      qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.users() })
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY })
    },
  })
}

export function useRbacRoles() {
  return useQuery({
    queryKey: RBAC_QUERY_KEYS.roles(),
    queryFn: rbacApi.listRoles,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RoleBodyPayload) => rbacApi.createRole(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.roles() }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: RoleBodyPayload }) =>
      rbacApi.updateRole(roleId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.roles() }),
  })
}

/** Role deletion cascades to every assignment through it — every open assignments
 *  view must be invalidated, not just the deleted role's own list. */
export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (roleId: string) => rbacApi.deleteRole(roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.roles() })
      qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.users() })
      qc.invalidateQueries({ queryKey: [...RBAC_QUERY_KEYS.all, "assignments"] })
    },
  })
}

export function useInvitations() {
  return useQuery({
    queryKey: RBAC_QUERY_KEYS.invitations(),
    queryFn: rbacApi.listInvitations,
  })
}

export function useCreateInvitation() {
  const qc = useQueryClient()
  const { i18n } = useTranslation()
  return useMutation({
    mutationFn: (payload: Omit<CreateInvitationPayload, "locale">) =>
      rbacApi.createInvitation({ ...payload, locale: i18n.language }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.invitations() }),
  })
}

export function useRegenerateInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => rbacApi.regenerateInvitation(invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.invitations() }),
  })
}

export function useRevokeInvitation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => rbacApi.revokeInvitation(invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: RBAC_QUERY_KEYS.invitations() }),
  })
}
