// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import type { Permission, Scope } from "@beechcms/core"
import { api } from "@/lib/api"

/** Single cache entry for `GET /api/settings/me`. `features/settings` re-uses this key
 *  through `SETTINGS_QUERY_KEYS.profile()` so the endpoint is fetched exactly once. */
export const ME_QUERY_KEY = ["settings", "profile"] as const

/** Wire mirror of `apps/api/src/shared/rbac/scoped-projection.ts#EffectivePermissionsPayload`. */
export interface EffectivePermissionsPayload {
  global: Permission[]
  byScope: Record<Scope, Permission[]>
}

export interface MeNotificationPrefs {
  contentCreate: boolean
  contentUpdate: boolean
  contentDelete: boolean
  mediaUpload: boolean
}

/** Full `GET /api/settings/me` payload. Superset of the legacy `UserProfile`. */
export interface MeResponse {
  id: string
  email: string
  name: string | null
  surname: string | null
  avatarUrl: string | null
  notificationPrefs: MeNotificationPrefs
  permissions: EffectivePermissionsPayload
  /** `users.role === 'admin'` — the developer/owner axis, NOT an RBAC permission. */
  isDeveloper: boolean
  manageableScopes: Scope[]
}

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<MeResponse>("/settings/me")
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
