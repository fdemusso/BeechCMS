// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DashboardWidgetShell } from '@/features/dashboard'
import { useWidgetGrowth } from '@/features/widget-data'
import type { AggregateFormula, TimeWindow } from '@/features/widget-data'

export interface GrowthWidgetProps {
  seed: string
  formula: AggregateFormula
  window: TimeWindow
  title: string
  icon?: LucideIcon
  detailPath: string
}

export function GrowthWidget({ seed, formula, window, title, icon, detailPath }: GrowthWidgetProps) {
  const { data, isLoading, isError } = useWidgetGrowth(seed, formula, window)

  const detailAction = (
    <a
      href={detailPath}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      Vedi di più →
    </a>
  )

  if (isLoading) {
    return (
      <DashboardWidgetShell title={title} icon={icon} action={detailAction}>
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
        </div>
      </DashboardWidgetShell>
    )
  }

  if (isError || !data) {
    return (
      <DashboardWidgetShell title={title} icon={icon} action={detailAction}>
        <p className="text-sm text-destructive">Impossibile caricare i dati.</p>
      </DashboardWidgetShell>
    )
  }

  const { current, previous, percentageChange, trend } = data

  const trendBadgeClass = cn(
    'flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border',
    trend === 'up' && 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800/60',
    trend === 'down' && 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-800/60',
    trend === 'flat' && 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400',
  )

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const sign = percentageChange > 0 ? '+' : ''

  const trendBadge = (
    <span className={trendBadgeClass}>
      <TrendIcon className="size-3" />
      {sign}{percentageChange.toFixed(1)}%
    </span>
  )

  return (
    <DashboardWidgetShell title={title} icon={icon} action={trendBadge}>
      <div className="flex flex-col gap-2">
        <p className="text-4xl font-bold tabular-nums tracking-tight text-foreground">
          {current.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">
          vs periodo precedente: <span className="font-medium">{previous.toLocaleString()}</span>
        </p>
        <div className="mt-auto pt-2">
          <a
            href={detailPath}
            className="text-xs text-primary hover:underline"
          >
            Vedi di più →
          </a>
        </div>
      </div>
    </DashboardWidgetShell>
  )
}
