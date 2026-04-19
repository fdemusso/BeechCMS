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
      { label: "Oggi", value: today, color: "text-blue-600 dark:text-blue-400" },
      { label: "Settimana", value: week, color: "text-violet-600 dark:text-violet-400" },
      { label: "Mese", value: month, color: "text-emerald-600 dark:text-emerald-400" },
    ]
    return (
      <DashboardWidgetShell>
        <div className="grid grid-cols-3 gap-2 h-full">
          {blocks.map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center justify-center rounded-lg bg-muted/40 p-2 gap-0.5">
              <span className={cn("text-2xl font-bold tabular-nums", color)}>{value}</span>
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </DashboardWidgetShell>
    )
  }
 
  // single variant
  const isPositive = today > 0 // Just as an example, showing if something was created today
  return (
    <DashboardWidgetShell>
      <div className="flex flex-col justify-center h-full gap-1">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold tabular-nums">{total.toLocaleString()}</span>
          <span className={cn("mb-1 flex items-center gap-0.5 text-sm font-semibold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            <TrendingUp className={cn("size-4", !isPositive && "opacity-20")} />
            {today}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">contenuti totali</p>
      </div>
    </DashboardWidgetShell>
  )
}

PublicationStatsWidget.displayName = "PublicationStatsWidget"

// Keep icon accessible for registry
export { BarChart3 as PublicationStatsIcon }
