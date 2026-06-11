// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from "@/lib/api"
import type { DashboardLayout } from "@beechcms/core"
import type { DashboardStats, CloudflareStats, RecentActivity, SystemHealth, ContentBreakdown, SetupChecklist } from "../types/dashboard.types"

export interface DashboardLayoutResponse {
  scope: string
  layout: DashboardLayout | null
}

export const dashboardApi = {
  getDashboardLayout: async (): Promise<DashboardLayoutResponse> => {
    const { data } = await api.get<DashboardLayoutResponse>("/dashboard-layout")
    return data
  },
  getTotalStats: async (): Promise<DashboardStats> => {
    const { data } = await api.get<DashboardStats>("/content/stats/total")
    return data
  },
  getCloudflareStats: async (): Promise<CloudflareStats> => {
    const { data } = await api.get<CloudflareStats>("/content/stats/cloudflare")
    return data
  },
  getRecentActivity: async (slug?: string): Promise<RecentActivity[]> => {
    const { data } = await api.get<RecentActivity[]>(
      "/content/stats/recent-activity",
      { params: { slug } }
    )
    return data
  },
  getSystemHealth: async (): Promise<SystemHealth> => {
    const { data } = await api.get<SystemHealth>("/content/stats/health")
    return data
  },
  getContentBreakdown: async (): Promise<ContentBreakdown[]> => {
    const { data } = await api.get<ContentBreakdown[]>("/content/stats/breakdown")
    return data
  },
  getSetupChecklist: async (): Promise<SetupChecklist> => {
    const { data } = await api.get<SetupChecklist>("/content/stats/setup-checklist")
    return data
  },
}
