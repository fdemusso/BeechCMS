import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import { TrendingDown, TrendingUp } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  trend?: {
    value: number
    isPositive: boolean
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

export function StatCard({ title, value, icon: Icon, description, trend, accent = "emerald" }: StatCardProps) {
  const accentStyle = ACCENT_STYLES[accent]

  return (
    <div className={cn(
      "h-full w-full flex flex-col",
      "rounded-2xl border border-neutral-200/80 bg-white/75 backdrop-blur-md p-5",
      "shadow-[0_1px_3px_0_rgb(0,0,0,0.05),0_1px_2px_-1px_rgb(0,0,0,0.04)]",
      "transition-all duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.08)]",
      "hover:border-neutral-300/80",
      "dark:border-neutral-700/50 dark:bg-neutral-900/65 dark:hover:border-neutral-600/60",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
          {description && (
            <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{description}</p>
          )}
          {trend && (
            <div className={cn(
              "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend.isPositive
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
            )}>
              {trend.isPositive
                ? <TrendingUp className="size-3" />
                : <TrendingDown className="size-3" />
              }
              {trend.isPositive ? "+" : "-"}{trend.value}%
            </div>
          )}
        </div>
        <div className={cn("shrink-0 rounded-xl bg-gradient-to-br p-2.5", accentStyle.icon)}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}
