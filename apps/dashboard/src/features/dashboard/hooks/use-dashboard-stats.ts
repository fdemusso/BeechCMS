import { useQuery } from "@tanstack/react-query"
import { dashboardApi } from "../api/dashboard.api"

export const DASHBOARD_QUERY_KEYS = {
  all: ["dashboard"] as const,
  stats: () => [...DASHBOARD_QUERY_KEYS.all, "stats"] as const,
  cloudflare: () => [...DASHBOARD_QUERY_KEYS.all, "cloudflare"] as const,
  activity: () => [...DASHBOARD_QUERY_KEYS.all, "activity"] as const,
}

export function useDashboardStats() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.stats(),
    queryFn: dashboardApi.getTotalStats,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCloudflareStats() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.cloudflare(),
    queryFn: dashboardApi.getCloudflareStats,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRecentActivity() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.activity(),
    queryFn: dashboardApi.getRecentActivity,
    refetchInterval: 30000, // Aggiorna ogni 30 secondi per la dashboard
  })
}
