import { api } from "@/lib/api"
import type { DashboardStats, CloudflareStats, RecentActivity, SystemHealth, ContentBreakdown } from "../types/dashboard.types"

export const dashboardApi = {
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
}
