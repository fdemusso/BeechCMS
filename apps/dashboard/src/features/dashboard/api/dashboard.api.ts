import { api } from "@/lib/api"
import type { DashboardStats, CloudflareStats, RecentActivity } from "../types/dashboard.types"

export const dashboardApi = {
  getTotalStats: async (): Promise<DashboardStats> => {
    const { data } = await api.get<DashboardStats>("/content/stats/total")
    return data
  },
  getCloudflareStats: async (): Promise<CloudflareStats> => {
    const { data } = await api.get<CloudflareStats>("/content/stats/cloudflare")
    return data
  },
  getRecentActivity: async (): Promise<RecentActivity[]> => {
    const { data } = await api.get<RecentActivity[]>("/content/stats/recent-activity")
    return data
  },
}
