import { useQuery } from "@tanstack/react-query"
import { dashboardApi } from "../api/dashboard.api"

export const DASHBOARD_QUERY_KEYS = {
  all: ["dashboard"] as const,
  stats: () => [...DASHBOARD_QUERY_KEYS.all, "stats"] as const,
  cloudflare: () => [...DASHBOARD_QUERY_KEYS.all, "cloudflare"] as const,
  activity: () => [...DASHBOARD_QUERY_KEYS.all, "activity"] as const,
  health: () => [...DASHBOARD_QUERY_KEYS.all, "health"] as const,
  breakdown: () => [...DASHBOARD_QUERY_KEYS.all, "breakdown"] as const,
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
    refetchInterval: 60 * 1000, // Aggiorna ogni minuto
    staleTime: 60 * 1000, // Valido per un minuto
  })
}

export function useSystemHealth() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.health(),
    queryFn: dashboardApi.getSystemHealth,
    staleTime: 5 * 60 * 1000,
  })
}
export function useContentBreakdown() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.breakdown(),
    queryFn: dashboardApi.getContentBreakdown,
    staleTime: 5 * 60 * 1000,
  })
}
