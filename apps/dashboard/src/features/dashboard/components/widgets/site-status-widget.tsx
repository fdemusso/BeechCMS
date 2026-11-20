// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Wifi, WifiOff } from '@/components/icons'
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "../dashboard-widget-shell"
import { useDashboardStats, useCloudflareStats, useSystemHealth } from "../../hooks/use-dashboard-stats"
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
  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : "—"

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
                "text-xs gap-1.5 px-2.5 py-1",
                ok
                  ? "bg-status-live-soft text-status-live-foreground border-status-live/30"
                  : "bg-status-danger-soft text-status-danger-foreground border-status-danger/30"
              )}
              variant="outline"
            >
              <span className={cn(
                "size-1.5 rounded-full",
                ok ? "bg-status-live ring-2 ring-status-live/30" : "bg-status-danger"
              )} />
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
        <div className="relative shrink-0">
          <span className={cn(
            "block size-3 rounded-full",
            online ? "bg-status-live" : "bg-status-danger"
          )} />
          {online && (
            <span className="absolute inset-0 rounded-full bg-status-live animate-ping opacity-60" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{online ? "Site online" : "Error"}</p>
          <p className="text-xs text-muted-foreground">Verified at {lastChecked}</p>
        </div>
        {online
          ? <Wifi className="size-4 text-status-live shrink-0" />
          : <WifiOff className="size-4 text-status-danger shrink-0" />
        }
      </div>
    </DashboardWidgetShell>
  )
}
