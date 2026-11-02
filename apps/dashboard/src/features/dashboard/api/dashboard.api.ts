// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from "@/lib/rpc"
import type { DashboardStats, CloudflareStats, RecentActivity, SystemHealth, ContentBreakdown, SetupChecklist } from "../types/dashboard.types"

export const dashboardApi = {
  getDashboardLayout: async () => {
    const response = await rpc.api["dashboard-layout"].$get()
    return response.json()
  },
  getTotalStats: async (): Promise<DashboardStats> => {
    const response = await rpc.api.content.stats.total.$get()
    return response.json()
  },
  getCloudflareStats: async (): Promise<CloudflareStats> => {
    const response = await rpc.api.content.stats.cloudflare.$get()
    return response.json()
  },
  getRecentActivity: async (slug?: string): Promise<RecentActivity[]> => {
    const response = await rpc.api.content.stats["recent-activity"].$get({ query: { slug } })
    return response.json()
  },
  getSystemHealth: async (): Promise<SystemHealth> => {
    const response = await rpc.api.content.stats.health.$get()
    return response.json()
  },
  getContentBreakdown: async (): Promise<ContentBreakdown[]> => {
    const response = await rpc.api.content.stats.breakdown.$get()
    return response.json()
  },
  getSetupChecklist: async (): Promise<SetupChecklist> => {
    const response = await rpc.api.content.stats["setup-checklist"].$get()
    return response.json()
  },
}
