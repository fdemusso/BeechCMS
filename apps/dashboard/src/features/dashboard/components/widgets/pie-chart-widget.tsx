// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { lazy, Suspense, useState } from "react"
import { useTranslation } from "react-i18next"
import { PieChart as PieChartIcon } from "lucide-react"
import type { TimeWindow, WidgetWindow } from "@beechcms/core"
import type { ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "../dashboard-widget-shell"
import { useWidgetDistribution } from "../../hooks/use-widget-data"
import { WidgetDateFilter } from "./_parts/widget-date-filter"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export interface PieChartConfig {
  seedSlug: string
  column: string
  window?: TimeWindow
  donut?: boolean
  limit?: number
}

const RechartsPieChart = lazy(() => import("./pie-chart-recharts"))

export function PieChartWidget({ config, title }: { config: PieChartConfig; title: string }) {
  const { t } = useTranslation()
  const [window, setWindow] = useState<WidgetWindow>(config.window ?? "all")
  const donut = config.donut ?? true
  const limit = config.limit ?? 8

  const dateFilter = <WidgetDateFilter value={window} onChange={setWindow} />

  const { data, isLoading, isError, refetch } = useWidgetDistribution(config.seedSlug, config.column, window, limit + 1)

  if (isLoading) {
    return (
      <DashboardWidgetShell title={title} icon={PieChartIcon} action={dateFilter}>
        <Skeleton className="h-full w-full rounded-lg" />
      </DashboardWidgetShell>
    )
  }

  if (isError) {
    return (
      <DashboardWidgetShell title={title} icon={PieChartIcon} action={dateFilter}>
        <WidgetError onRetry={() => refetch()} />
      </DashboardWidgetShell>
    )
  }

  const slices = data?.slices ?? []
  if (slices.length === 0) {
    return (
      <DashboardWidgetShell title={title} icon={PieChartIcon} action={dateFilter}>
        <WidgetEmpty icon={PieChartIcon} title={t("dashboard.widgets.chart.empty.title")} description={t("dashboard.widgets.chart.empty.description")} />
      </DashboardWidgetShell>
    )
  }

  const visible = slices.slice(0, limit)
  const moreCount = slices.length - visible.length
  const chartConfig: ChartConfig = Object.fromEntries(
    visible.map((slice, index) => [slice.label, { label: slice.label, color: PIE_COLORS[index % PIE_COLORS.length] }]),
  )

  return (
    <DashboardWidgetShell title={title} icon={PieChartIcon} action={dateFilter}>
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="aspect-square max-h-full w-full min-h-0">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-lg" />}>
            <RechartsPieChart data={visible} donut={donut} chartConfig={chartConfig} />
          </Suspense>
        </div>
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {visible.map((slice, index) => (
            <li key={slice.label} className="flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
              />
              <span className="truncate">{slice.label}</span>
              <span className="font-mono font-medium text-foreground tabular-nums">{slice.value.toLocaleString()}</span>
            </li>
          ))}
          {moreCount > 0 && (
            <li className="text-muted-foreground/70">{t("dashboard.widgets.chart.more", { count: moreCount })}</li>
          )}
        </ul>
      </div>
    </DashboardWidgetShell>
  )
}
