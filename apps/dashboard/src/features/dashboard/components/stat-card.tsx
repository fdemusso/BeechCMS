// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import { TrendingDown, TrendingUp } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  timeLabel?: string
  trend?: {
    value: number
    direction: 'up' | 'down' | 'flat'
  }
  accent?: "emerald" | "blue" | "violet" | "amber" | "rose"
}

const ACCENT_STYLES: Record<NonNullable<StatCardProps["accent"]>, { icon: string; badge: string }> = {
  emerald: { icon: "from-emerald-500/20 to-emerald-400/10 text-emerald-600 dark:text-emerald-400", badge: "" },
  blue:    { icon: "from-blue-500/20 to-blue-400/10 text-blue-600 dark:text-blue-400", badge: "" },
  violet:  { icon: "from-violet-500/20 to-violet-400/10 text-violet-600 dark:text-violet-400", badge: "" },
  amber:   { icon: "from-amber-500/20 to-amber-400/10 text-amber-600 dark:text-amber-400", badge: "" },
  rose:    { icon: "from-rose-500/20 to-rose-400/10 text-rose-600 dark:text-rose-400", badge: "" },
}

export function StatCard({ title, value, icon: Icon, description, timeLabel, trend, accent = "emerald" }: StatCardProps) {
  const accentStyle = ACCENT_STYLES[accent]

  return (
    <div className={cn(
      "h-full w-full flex flex-col justify-between",
      "rounded-2xl border border-border bg-card/85 backdrop-blur-sm p-5",
      "shadow-[0_1px_3px_0_rgb(0,0,0,0.05),0_1px_2px_-1px_rgb(0,0,0,0.04)]",
      "transition-all duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.08)]",
      "hover:border-border/80",
      "dark:bg-card/65 dark:hover:border-border/60",
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-col min-w-0">
          <p className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums leading-none">{value}</p>
        </div>
        <div className={cn("shrink-0 rounded-xl bg-gradient-to-br p-2.5", accentStyle.icon)}>
          <Icon size={20} />
        </div>
      </div>
      
      <div className="flex items-end justify-between mt-6">
        <div className="flex flex-col gap-1">
          {description && (
            <p className="text-xs text-muted-foreground leading-snug">{description}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {timeLabel && <span>{timeLabel}</span>}
              <span className={cn(
                "inline-flex items-center gap-0.5", 
                trend.direction === 'up' ? "text-emerald-500" : 
                trend.direction === 'down' ? "text-rose-500" : 
                "text-muted-foreground"
              )}>
                {trend.direction === 'up' && <TrendingUp className="size-3" />}
                {trend.direction === 'down' && <TrendingDown className="size-3" />}
                {trend.direction === 'up' ? "+" : trend.direction === 'down' ? "-" : ""}{trend.value}%
              </span>
            </div>
          )}
        </div>
        
        {trend && (
          <div className="w-20 h-6 ml-4 shrink-0">
            <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible" preserveAspectRatio="none">
              {trend.direction === 'up' && (
                <>
                  <path d="M0 25 C 20 20, 30 25, 50 15 C 70 5, 80 15, 100 5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500" strokeLinecap="round" />
                  <path d="M0 25 C 20 20, 30 25, 50 15 C 70 5, 80 15, 100 5 L 100 30 L 0 30 Z" fill="currentColor" className="text-emerald-500/10" />
                </>
              )}
              {trend.direction === 'down' && (
                <>
                  <path d="M0 5 C 20 10, 30 5, 50 15 C 70 25, 80 15, 100 25" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-rose-500" strokeLinecap="round" />
                  <path d="M0 5 C 20 10, 30 5, 50 15 C 70 25, 80 15, 100 25 L 100 30 L 0 30 Z" fill="currentColor" className="text-rose-500/10" />
                </>
              )}
              {trend.direction === 'flat' && (
                <>
                  <path d="M0 15 L 100 15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted-foreground" strokeLinecap="round" />
                  <path d="M0 15 L 100 15 L 100 30 L 0 30 Z" fill="currentColor" className="text-muted-foreground/10" />
                </>
              )}
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
