// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as Icons from "lucide-react"
import { BarChart3, type LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { AggregateFormula, TimeWindow } from "@beechcms/core"
import { useWidgetAggregate, useWidgetGrowth } from "../../hooks/use-widget-data"
import { StatCard } from "../stat-card"
import { WidgetError } from "./_parts/widget-error"

export interface StatWidgetFormulaConfig {
  seedSlug: string
  formula?: AggregateFormula
  window?: TimeWindow
  label?: string
  icon?: string
  showTrend?: boolean
}

function resolveIcon(name?: string): LucideIcon {
  if (!name) return BarChart3
  const icon = (Icons as unknown as Record<string, LucideIcon>)[name]
  return typeof icon === "function" || typeof icon === "object" ? icon : BarChart3
}

/** Formula-driven KPI card: value from `aggregate`, optional trend from `growth`. */
export function StatWidget({ config }: { config: StatWidgetFormulaConfig }) {
  const { t } = useTranslation()
  const formula = config.formula ?? { op: "count" }
  const window = config.window ?? "month"
  const showTrend = config.showTrend ?? true

  const aggregateQuery = useWidgetAggregate(config.seedSlug, formula, window)
  const growthQuery = useWidgetGrowth(config.seedSlug, formula, window)

  if (aggregateQuery.isError) {
    return <WidgetError onRetry={() => aggregateQuery.refetch()} />
  }

  const Icon = resolveIcon(config.icon)
  const label = config.label ?? t("dashboard.widgets.stat.formula.defaultLabel")
  const value = aggregateQuery.isLoading
    ? "..."
    : (aggregateQuery.data?.value ?? 0).toLocaleString()

  let trend: { value: number; isPositive: boolean } | undefined
  if (showTrend && growthQuery.data) {
    trend = {
      value: Math.abs(growthQuery.data.percentageChange),
      isPositive: growthQuery.data.trend !== "down",
    }
  }

  return <StatCard title={label} value={value} icon={Icon} trend={trend} />
}
