// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from '@/lib/api'
import type { DashboardLayout } from '@beechcms/core'

export interface SaveDashboardLayoutResponse {
  ok: true
  layout: DashboardLayout
  warnings: string[]
}

export interface ScopedDashboardLayoutResponse {
  scope: string
  layout: DashboardLayout | null
}

export interface DashboardScopeInfo {
  scope: string
  stored: boolean
}

export const dashboardBuilderApi = {
  /** Raw stored layout for `scope`, or `{ scope, layout: null }` if nothing is stored. Admin-only. */
  getLayout: async (scope: string): Promise<ScopedDashboardLayoutResponse> => {
    const { data } = await api.get<ScopedDashboardLayoutResponse>(`/dashboard-layout/${scope}`)
    return data
  },
  /** Closed set of dashboard scopes annotated with whether each has a stored row. Admin-only. */
  getScopes: async (): Promise<DashboardScopeInfo[]> => {
    const { data } = await api.get<DashboardScopeInfo[]>('/dashboard-layout/scopes')
    return data
  },
  saveLayout: async (scope: string, layout: DashboardLayout): Promise<SaveDashboardLayoutResponse> => {
    const { data } = await api.put<SaveDashboardLayoutResponse>(`/dashboard-layout/${scope}`, layout)
    return data
  },
  resetLayout: async (scope: string): Promise<void> => {
    await api.delete(`/dashboard-layout/${scope}`)
  },
}
