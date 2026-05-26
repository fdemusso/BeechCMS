// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardWidgetShell } from '@/features/dashboard'
import { useWidgetAggregate } from '@/features/widget-data'
import type { AggregateFormula } from '@/features/widget-data'

export interface KpiWidgetProps {
  seed: string
  formula: AggregateFormula
  title: string
  icon: LucideIcon
  detailPath: string
}

export function KpiWidget({ seed, formula, title, icon: Icon, detailPath }: KpiWidgetProps) {
  const { data, isLoading, isError } = useWidgetAggregate(seed, formula, 'all')

  const detailAction = (
    <a
      href={detailPath}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      Dettagli →
    </a>
  )

  if (isLoading) {
    return (
      <DashboardWidgetShell title={title} icon={Icon} action={detailAction}>
        <Skeleton className="h-10 w-2/3 rounded-lg" />
      </DashboardWidgetShell>
    )
  }

  if (isError || !data) {
    return (
      <DashboardWidgetShell title={title} icon={Icon} action={detailAction}>
        <p className="text-sm text-destructive">Impossibile caricare i dati.</p>
      </DashboardWidgetShell>
    )
  }

  const formattedValue = data.value.toLocaleString()

  return (
    <DashboardWidgetShell title={title} icon={Icon}>
      <div className="flex items-center gap-4 h-full">
        <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 shrink-0">
          <Icon className="size-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
            {formattedValue}
          </p>
          <p className="text-xs text-muted-foreground truncate">{title}</p>
        </div>
        <div className="shrink-0 self-end">
          <a
            href={detailPath}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dettagli →
          </a>
        </div>
      </div>
    </DashboardWidgetShell>
  )
}
