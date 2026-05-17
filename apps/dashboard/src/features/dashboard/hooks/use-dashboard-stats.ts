import { useQuery } from "@tanstack/react-query"
import { dashboardApi } from "../api/dashboard.api"
import { DASHBOARD_QUERY_KEYS } from "@/features/shared"

export { DASHBOARD_QUERY_KEYS }

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

export function useRecentActivity(slug?: string) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.activity(), slug],
    queryFn: () => dashboardApi.getRecentActivity(slug),
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

export function useSetupChecklist() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.setupChecklist(),
    queryFn: dashboardApi.getSetupChecklist,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}
