import { useSystemHealth } from "../hooks/use-dashboard-stats"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ShieldCheck, ShieldAlert, Database, Cloud } from "lucide-react"
import { cn } from "@/lib/utils"

export function SystemHealth() {
  const { data: health, isLoading } = useSystemHealth()

  if (isLoading || !health) {
    return (
      <Card className="overflow-hidden border-none bg-white/50 backdrop-blur-xl dark:bg-neutral-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[120px] w-full animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
        </CardContent>
      </Card>
    )
  }

  const isWarning = health.status === "warning"

  return (
    <Card className="overflow-hidden border-none bg-white/50 backdrop-blur-xl dark:bg-neutral-900/50 shadow-sm transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {isWarning ? (
            <ShieldAlert className="size-4 text-amber-500" />
          ) : (
            <ShieldCheck className="size-4 text-emerald-500" />
          )}
          System Health
        </CardTitle>
        <div className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
          isWarning ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
        )}>
          {health.status}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* D1 Quota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
              <Database className="size-3" />
              <span>D1 Monthly Requests</span>
            </div>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {health.database.requests30d.toLocaleString()} / {(health.database.limit / 1000000).toFixed(0)}M
            </span>
          </div>
          <Progress 
            value={health.database.percentage} 
            className="h-1.5" 
            indicatorClassName={cn(
              health.database.percentage > 80 ? "bg-amber-500" : "bg-emerald-500"
            )}
          />
        </div>

        {/* R2 Quota */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
              <Cloud className="size-3" />
              <span>R2 Storage Used</span>
            </div>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {(health.storage.used / (1024 * 1024)).toFixed(1)} MB / {(health.storage.limit / (1024 * 1024 * 1024)).toFixed(0)} GB
            </span>
          </div>
          <Progress 
            value={health.storage.percentage} 
            className="h-1.5" 
            indicatorClassName={cn(
              health.storage.percentage > 80 ? "bg-amber-500" : "bg-emerald-500"
            )}
          />
        </div>

        <p className="text-[10px] text-neutral-400 dark:text-neutral-500 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          Last check: {new Date(health.lastUpdate * 1000).toLocaleTimeString()}
        </p>
      </CardContent>
    </Card>
  )
}
