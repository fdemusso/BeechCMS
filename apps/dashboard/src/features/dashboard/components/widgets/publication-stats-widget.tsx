// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { BarChart3, TrendingUp } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
import { useDashboardStats } from "@/features/dashboard"
import { cn } from "@/lib/utils"
import { WidgetError } from "./_parts/widget-error"

export interface PublicationStatsWidgetProps {
  variant?: "trio" | "single"
}

export function PublicationStatsWidget({ variant = "single" }: PublicationStatsWidgetProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = useDashboardStats()

  if (isLoading) return (
    <DashboardWidgetShell>
      <div className="flex gap-3 h-full">
        {Array.from({ length: variant === "trio" ? 3 : 1 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-16 animate-pulse rounded-lg" />
        ))}
      </div>
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  const { total, today, week, month } = data ?? { total: 0, today: 0, week: 0, month: 0 }

  if (variant === "trio") {
    const blocks = [
      {
        label: t("dashboard.widgets.publicationStats.today"),
        value: today,
        color: "text-blue-600 dark:text-blue-400",
        border: "border-l-blue-400/60",
        bg: "bg-blue-50/60 dark:bg-blue-500/10",
      },
      {
        label: t("dashboard.widgets.publicationStats.week"),
        value: week,
        color: "text-violet-600 dark:text-violet-400",
        border: "border-l-violet-400/60",
        bg: "bg-violet-50/60 dark:bg-violet-500/10",
      },
      {
        label: t("dashboard.widgets.publicationStats.month"),
        value: month,
        color: "text-emerald-600 dark:text-emerald-400",
        border: "border-l-emerald-400/60",
        bg: "bg-emerald-50/60 dark:bg-emerald-500/10",
      },
    ]
    return (
      <DashboardWidgetShell>
        {/* On mobile: single scrollable row so numbers never overflow or get cut.
            On sm+: fixed 3-column grid. */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 sm:grid sm:grid-cols-3 sm:overflow-visible h-full">
          {blocks.map(({ label, value, color, border, bg }) => (
            <div
              key={label}
              className={cn(
                "flex flex-col justify-center rounded-lg border-l-2 px-3 py-2 gap-0.5",
                "min-w-[80px] shrink-0 sm:min-w-0 sm:shrink",
                border,
                bg
              )}
            >
              <span className={cn("text-xl font-bold tabular-nums leading-none sm:text-2xl", color)}>{value}</span>
              <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </DashboardWidgetShell>
    )
  }

  const isPositive = today > 0
  return (
    <DashboardWidgetShell>
      <div className="flex flex-col justify-center h-full gap-1">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums">{total.toLocaleString()}</span>
          <span className={cn(
            "mb-1 flex items-center gap-0.5 text-sm font-semibold",
            isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}>
            <TrendingUp className={cn("size-4", !isPositive && "opacity-20")} />
            {today}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t("dashboard.widgets.publicationStats.totalContent")}</p>
      </div>
    </DashboardWidgetShell>
  )
}

PublicationStatsWidget.displayName = "PublicationStatsWidget"

export { BarChart3 as PublicationStatsIcon }
