import { HardDrive } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
import { useCloudflareStats } from "@/features/dashboard"
import { cn } from "@/lib/utils"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

export interface StorageWidgetProps {
  variant?: "bar" | "gauge"
  /** Total storage in bytes. Default 10 GB */
  totalBytes?: number
}

const DEFAULT_TOTAL = 10 * 1024 * 1024 * 1024 // 10 GB

function formatGb(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1)
}

function gaugeColor(pct: number): string {
  if (pct > 85) return "#ef4444"
  if (pct > 60) return "#eab308"
  return "#22c55e"
}

function GaugeSvg({ pct }: { pct: number }) {
  const radius = 40
  const cx = 56
  const cy = 56
  const strokeWidth = 10
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  const color = gaugeColor(pct)

  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden>
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted-foreground/20 dark:text-muted-foreground/40"
      />
      {/* Indicator */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        className="transition-all duration-1000 ease-in-out"
      />
      {/* Percentuale al centro */}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="16"
        fontWeight="700"
        fill={color}
        className="tabular-nums"
      >
        {pct}%
      </text>
    </svg>
  )
}

export function StorageWidget({ variant = "bar", totalBytes = DEFAULT_TOTAL }: StorageWidgetProps) {
  const { data: cfData, isLoading, isError, refetch } = useCloudflareStats()

  if (isLoading) return (
    <DashboardWidgetShell>
      <Skeleton className="h-12 w-full animate-pulse" />
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  const storageBytes = cfData ? cfData.storage.used * 1024 * 1024 : 0
  const pct = Math.min(100, Math.round((storageBytes / totalBytes) * 100))

  if (!cfData) return (
    <DashboardWidgetShell>
      <WidgetEmpty icon={HardDrive} title="Nessun dato storage" />
    </DashboardWidgetShell>
  )

  const label = `${formatGb(storageBytes)} GB di ${formatGb(totalBytes)} GB`

  if (variant === "gauge") {
    return (
      <DashboardWidgetShell>
        <div className="flex items-center gap-4 h-full w-full">
          {/* Donut con % al centro — a sinistra */}
          <div className="shrink-0">
            <GaugeSvg pct={pct} />
          </div>
          {/* Dettaglio GB a destra */}
          <div className="flex-1 text-right">
            <p className="text-sm font-semibold text-foreground leading-tight tabular-nums">
              {formatGb(storageBytes)}&nbsp;GB
            </p>
            <p className="text-xs text-muted-foreground">
              di {formatGb(totalBytes)}&nbsp;GB
            </p>
          </div>
        </div>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell>
      <div className="flex flex-col justify-center gap-2 h-full">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Storage R2</span>
          <span className="font-semibold tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </DashboardWidgetShell>
  )
}
