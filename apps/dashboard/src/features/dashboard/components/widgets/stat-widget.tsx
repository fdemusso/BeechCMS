import type { IconComponent } from '@/lib/icon-registry'
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ChartBar as BarChart3 } from 'reicon-react'
import { useTranslation } from "react-i18next"
import type { AggregateFormula, TimeWindow } from "@beechcms/core"
import { useWidgetAggregate, useWidgetGrowth } from "../../hooks/use-widget-data"
import { StatCard } from "../stat-card"
import { WidgetError } from "./_parts/widget-error"
import { resolveIcon as resolveRegistryIcon } from '@/lib/icon-registry'

export interface StatWidgetFormulaConfig {
  seedSlug: string
  formula?: AggregateFormula
  window?: TimeWindow
  label?: string
  icon?: string
  showTrend?: boolean
}

function resolveIcon(name?: string): IconComponent {
  if (!name) return BarChart3
  const icon = resolveRegistryIcon(name)
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

  let trend: { value: number; direction: 'up' | 'down' | 'flat' } | undefined
  if (showTrend && growthQuery.data) {
    trend = {
      value: Math.abs(growthQuery.data.percentageChange),
      direction: growthQuery.data.trend,
    }
  }

  const windowKey = window.charAt(0).toUpperCase() + window.slice(1)
  const timeLabel = window !== "all" ? `vs ${t(`dashboard.builder.config.window${windowKey}`).toLowerCase()}` : undefined

  return <StatCard title={label} value={value} icon={Icon} trend={trend} timeLabel={timeLabel} />
}
