import { useTranslation } from "react-i18next"
import { HardDrive } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
import { useCloudflareStats } from "@/features/dashboard"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

export interface StorageWidgetProps {
  variant?: "bar" | "gauge"
  totalBytes?: number
}

const DEFAULT_TOTAL = 10 * 1024 * 1024 * 1024

function formatGb(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1)
}

function gaugeColor(pct: number): string {
  if (pct > 85) return "#ef4444"
  if (pct > 60) return "#eab308"
  return "#22c55e"
}

function GaugeSvg({ pct, usedLabel }: { pct: number; usedLabel: string }) {
  const radius = 38
  const cx = 52
  const cy = 52
  const strokeWidth = 8
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  const color = gaugeColor(pct)

  return (
    <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden>
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none" stroke="currentColor" strokeWidth={strokeWidth}
        className="text-muted-foreground/15 dark:text-muted-foreground/30"
      />
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        className="transition-all duration-1000 ease-in-out"
        style={{ filter: `drop-shadow(0 0 4px ${color}60)` }}
      />
      <text
        x={cx} y={cy - 4}
        textAnchor="middle" dominantBaseline="central"
        fontSize="15" fontWeight="700" fill={color}
        className="tabular-nums"
      >
        {pct}%
      </text>
      <text
        x={cx} y={cy + 12}
        textAnchor="middle" dominantBaseline="central"
        fontSize="9" fontWeight="500"
        className="fill-muted-foreground"
        fill="currentColor"
        style={{ color: "var(--muted-foreground)" }}
      >
        {usedLabel}
      </text>
    </svg>
  )
}

export function StorageWidget({ variant = "bar", totalBytes = DEFAULT_TOTAL }: StorageWidgetProps) {
  const { t } = useTranslation()
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
      <WidgetEmpty icon={HardDrive} title={t("dashboard.widgets.storage.noData")} />
    </DashboardWidgetShell>
  )

  if (variant === "gauge") {
    return (
      <DashboardWidgetShell>
        {/* On very narrow mobile: stack gauge above text.
            On sm+: side-by-side as designed. */}
        <div className="flex flex-col items-center gap-2 h-full w-full xs:flex-row sm:flex-row sm:items-center sm:gap-3">
          <div className="shrink-0">
            <GaugeSvg pct={pct} usedLabel={t("dashboard.widgets.storage.used")} />
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("dashboard.widgets.storage.title")}</p>
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">
              {formatGb(storageBytes)}&nbsp;<span className="text-sm font-medium text-muted-foreground">GB</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("dashboard.widgets.storage.total", { total: formatGb(totalBytes) })}
            </p>
          </div>
        </div>
      </DashboardWidgetShell>
    )
  }

  const label = `${formatGb(storageBytes)} GB di ${formatGb(totalBytes)} GB`

  return (
    <DashboardWidgetShell>
      <div className="flex flex-col justify-center gap-2 h-full">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">{t("dashboard.widgets.storage.title")}</span>
          <span className="font-bold tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </DashboardWidgetShell>
  )
}
