// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import type { rpc } from '@/lib/rpc'
import { dashboardBuilderApi } from './api/dashboard-layout.api'

/** One role as `GET /api/dashboard-layout/roles` serves it. Inferred from the route. */
export type LayoutRole = InferResponseType<typeof rpc.api["dashboard-layout"]["roles"]["$get"]>[number]

export const LAYOUT_ROLES_QUERY_KEY = ["dashboard-builder-roles"] as const

/** The role list the builder targets tabs with. Builder-only: mounted inside the open dialog. */
export function useLayoutRoles(enabled = true): UseQueryResult<LayoutRole[]> {
  return useQuery({
    queryKey: LAYOUT_ROLES_QUERY_KEY,
    queryFn: dashboardBuilderApi.getRoles,
    enabled,
    // The pre-save orphan check relies on this list; a role changed elsewhere must show on open.
    staleTime: 0,
  })
}
