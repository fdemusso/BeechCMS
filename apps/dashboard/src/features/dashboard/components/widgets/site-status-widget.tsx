import { Wifi, WifiOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
import { useDashboardStats, useCloudflareStats, useSystemHealth } from "@/features/dashboard"
import { cn } from "@/lib/utils"
import { WidgetError } from "./_parts/widget-error"

export interface SiteStatusWidgetProps {
  variant?: "badge" | "pill-row"
}

export function SiteStatusWidget({ variant = "badge" }: SiteStatusWidgetProps) {
  const { data: healthData, isLoading, isError, refetch, dataUpdatedAt } = useSystemHealth()
  const { data: cfData } = useCloudflareStats()
  const { data: statsData } = useDashboardStats()

  const isOnline = healthData?.status === "healthy" || healthData?.status === "warning"

  if (isLoading) return (
    <DashboardWidgetShell>
      <Skeleton className="h-10 w-full animate-pulse" />
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  const online = isOnline ?? false
  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—"

  if (variant === "pill-row") {
    const pills = [
      { label: "API", ok: online },
      { label: "Storage", ok: !!cfData },
      { label: "DB", ok: typeof statsData?.total === "number" && statsData.total >= 0 },
    ]
    return (
      <DashboardWidgetShell>
        <div className="flex flex-wrap items-center gap-2 h-full">
          {pills.map(({ label, ok }) => (
            <Badge
              key={label}
              className={cn(
                "text-xs gap-1",
                ok
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                  : "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-800"
              )}
              variant="outline"
            >
              <span className={cn("size-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")} />
              {label}
            </Badge>
          ))}
        </div>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell>
      <div className="flex items-center gap-3 h-full">
        <span className={cn("size-3 rounded-full ring-2 shrink-0", online ? "bg-emerald-500 ring-emerald-200 dark:ring-emerald-900" : "bg-red-500 ring-red-200 dark:ring-red-900")} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{online ? "Sito online" : "Errore"}</p>
          <p className="text-xs text-muted-foreground">Verificato alle {lastChecked}</p>
        </div>
        {online ? <Wifi className="size-4 text-emerald-500 shrink-0" /> : <WifiOff className="size-4 text-red-500 shrink-0" />}
      </div>
    </DashboardWidgetShell>
  )
}
