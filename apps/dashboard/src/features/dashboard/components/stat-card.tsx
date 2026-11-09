import type { IconComponent } from '@/lib/icon-registry'
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { cn } from "@/lib/utils"

import { Chart as TrendingDown, ChartBarTrendUp as TrendingUp } from '@/components/icons'

interface StatCardProps {
  title: string
  value: string | number
  icon: IconComponent
  description?: string
  timeLabel?: string
  trend?: {
    value: number
    direction: 'up' | 'down' | 'flat'
  }
  accent?: "emerald" | "blue" | "violet" | "amber" | "rose"
}

const ACCENT_STYLES: Record<NonNullable<StatCardProps["accent"]>, { icon: string; badge: string }> = {
  emerald: { icon: "bg-status-live-soft text-status-live-foreground", badge: "" },
  blue:    { icon: "bg-status-info-soft text-status-info-foreground", badge: "" },
  violet:  { icon: "bg-category-soft text-foreground", badge: "" },
  amber:   { icon: "bg-status-warning-soft text-status-warning-foreground", badge: "" },
  rose:    { icon: "bg-status-danger-soft text-status-danger-foreground", badge: "" },
}

export function StatCard({ title, value, icon: Icon, description, timeLabel, trend, accent = "emerald" }: StatCardProps) {
  const accentStyle = ACCENT_STYLES[accent]

  return (
    <div className={cn(
      "h-full w-full flex flex-col justify-between",
      "rounded-lg border border-border bg-card/85 backdrop-blur-sm p-5",
      "transition-colors",
      "hover:border-border/80",
      "dark:bg-card/65 dark:hover:border-border/60",
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-col min-w-0">
          <p className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
          <p className="text-5xl font-bold tracking-tight text-foreground tabular-nums leading-none">{value}</p>
        </div>
        <div className={cn("shrink-0 rounded-lg p-2.5", accentStyle.icon)}>
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
                trend.direction === 'up' ? "text-status-live-foreground" : 
                trend.direction === 'down' ? "text-status-danger-foreground" : 
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
                  <path d="M0 25 C 20 20, 30 25, 50 15 C 70 5, 80 15, 100 5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-status-live" strokeLinecap="round" />
                  <path d="M0 25 C 20 20, 30 25, 50 15 C 70 5, 80 15, 100 5 L 100 30 L 0 30 Z" fill="currentColor" className="text-status-live/10" />
                </>
              )}
              {trend.direction === 'down' && (
                <>
                  <path d="M0 5 C 20 10, 30 5, 50 15 C 70 25, 80 15, 100 25" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-status-danger" strokeLinecap="round" />
                  <path d="M0 5 C 20 10, 30 5, 50 15 C 70 25, 80 15, 100 25 L 100 30 L 0 30 Z" fill="currentColor" className="text-status-danger/10" />
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
