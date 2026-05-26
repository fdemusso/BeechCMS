// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DashboardWidgetShell } from '@/features/dashboard'
import { useWidgetLeaderboard } from '@/features/widget-data'

export interface LeaderboardWidgetProps {
  seed: string
  scoreColumn: string
  title: string
  detailPath: string
  limit?: number
}

const RANK_BADGE_CLASSES: Record<number, string> = {
  0: 'bg-amber-400/20 text-amber-700 border-amber-300 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-700',
  1: 'bg-slate-400/20 text-slate-700 border-slate-300 dark:bg-slate-400/10 dark:text-slate-400 dark:border-slate-600',
  2: 'bg-amber-700/20 text-amber-800 border-amber-400 dark:bg-amber-700/10 dark:text-amber-600 dark:border-amber-800',
}

function rankBadgeClass(index: number): string {
  return RANK_BADGE_CLASSES[index] ?? 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
}

export function LeaderboardWidget({
  seed,
  scoreColumn,
  title,
  detailPath,
  limit = 5,
}: LeaderboardWidgetProps) {
  const { data, isLoading, isError } = useWidgetLeaderboard(seed, scoreColumn, { limit, orderBy: 'desc' })

  const viewAllAction = (
    <a
      href={detailPath}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      Vedi tabella →
    </a>
  )

  if (isLoading) {
    return (
      <DashboardWidgetShell title={title} action={viewAllAction}>
        <div className="space-y-2.5">
          {Array.from({ length: limit }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg animate-pulse" />
          ))}
        </div>
      </DashboardWidgetShell>
    )
  }

  if (isError || !data) {
    return (
      <DashboardWidgetShell title={title} action={viewAllAction}>
        <p className="text-sm text-destructive">Impossibile caricare i dati.</p>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell title={title} action={viewAllAction}>
      <ol className="space-y-1.5">
        {data.map((entry, index) => (
          <li
            key={entry.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <span
              className={cn(
                'flex items-center justify-center size-6 rounded-full text-xs font-bold border shrink-0',
                rankBadgeClass(index),
              )}
            >
              {index + 1}
            </span>
            <span className="flex-1 text-sm font-medium truncate text-foreground">
              {entry.label}
            </span>
            <Badge
              variant="outline"
              className="shrink-0 tabular-nums text-xs font-semibold"
            >
              {typeof entry.score === 'number' ? entry.score.toLocaleString() : entry.score}
            </Badge>
          </li>
        ))}
      </ol>
    </DashboardWidgetShell>
  )
}
