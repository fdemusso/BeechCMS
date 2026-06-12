// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { lazy, Suspense, useState } from "react"
import { useTranslation } from "react-i18next"
import type { LucideIcon } from "lucide-react"
import type { AggregateFormula, TimeWindow, WidgetWindow, TimeseriesPoint } from "@beechcms/core"
import type { ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "../dashboard-widget-shell"
import { useWidgetTimeseries } from "../../hooks/use-widget-data"
import { WidgetDateFilter } from "./_parts/widget-date-filter"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

export type TimeseriesChartKind = "line" | "bar" | "area"

export interface TimeseriesChartConfig {
  seedSlug: string
  formula?: AggregateFormula
  window?: TimeWindow
  groupColumn?: string
  color?: string
}

export interface TimeseriesChartWidgetProps {
  config: TimeseriesChartConfig
  kind: TimeseriesChartKind
  title: string
  icon: LucideIcon
}

const RechartsTimeseriesChart = lazy(() => import("./timeseries-chart-recharts"))

/** Fills missing daily buckets with zero so line/area trends don't lie about gaps. */
function zeroFillDaily(points: TimeseriesPoint[]): TimeseriesPoint[] {
  if (points.length < 2) return points

  const byLabel = new Map(points.map((point) => [point.label, point.value]))
  const start = new Date(`${points[0].label}T00:00:00Z`)
  const end = new Date(`${points[points.length - 1].label}T00:00:00Z`)

  const filled: TimeseriesPoint[] = []
  for (const cursor = start; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const label = cursor.toISOString().slice(0, 10)
    filled.push({ label, value: byLabel.get(label) ?? 0 })
  }
  return filled
}

export function TimeseriesChartWidget({ config, kind, title, icon }: TimeseriesChartWidgetProps) {
  const { t } = useTranslation()
  const formula = config.formula ?? { op: "count" }
  const [window, setWindow] = useState<WidgetWindow>(config.window ?? "month")
  const groupColumn = config.groupColumn ?? "created_at"
  const color = config.color ?? "var(--chart-1)"

  const dateFilter = <WidgetDateFilter value={window} onChange={setWindow} />

  const { data, isLoading, isError, refetch } = useWidgetTimeseries(config.seedSlug, formula, window, groupColumn)

  if (isLoading) {
    return (
      <DashboardWidgetShell title={title} icon={icon} action={dateFilter}>
        <Skeleton className="h-full w-full rounded-lg" />
      </DashboardWidgetShell>
    )
  }

  if (isError) {
    return (
      <DashboardWidgetShell title={title} icon={icon} action={dateFilter}>
        <WidgetError onRetry={() => refetch()} />
      </DashboardWidgetShell>
    )
  }

  const points = data?.points ?? []
  if (points.length === 0) {
    return (
      <DashboardWidgetShell title={title} icon={icon} action={dateFilter}>
        <WidgetEmpty icon={icon} title={t("dashboard.widgets.chart.empty.title")} description={t("dashboard.widgets.chart.empty.description")} />
      </DashboardWidgetShell>
    )
  }

  const chartData = kind === "bar" ? points : zeroFillDaily(points)
  const chartConfig: ChartConfig = { value: { label: title, color } }

  return (
    <DashboardWidgetShell title={title} icon={icon} action={dateFilter}>
      <Suspense fallback={<Skeleton className="h-full w-full rounded-lg" />}>
        <RechartsTimeseriesChart kind={kind} data={chartData} color={color} chartConfig={chartConfig} />
      </Suspense>
    </DashboardWidgetShell>
  )
}
