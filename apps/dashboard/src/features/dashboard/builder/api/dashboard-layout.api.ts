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

export const dashboardBuilderApi = {
  saveLayout: async (layout: DashboardLayout): Promise<SaveDashboardLayoutResponse> => {
    const { data } = await api.put<SaveDashboardLayoutResponse>('/dashboard-layout', layout)
    return data
  },
  resetLayout: async (): Promise<void> => {
    await api.delete('/dashboard-layout')
  },
}
