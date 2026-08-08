import { useTranslation } from "react-i18next"
import { z } from "zod"
import { FileText, Globe, Flash as Zap, Database } from 'reicon-react'
import { StatCard } from "../../components/stat-card"
import { StatWidget } from "../../components/widgets/stat-widget"
import { useDashboardStats, useCloudflareStats } from "../../hooks/use-dashboard-stats"
import type { DashboardStats, CloudflareStats } from "../../types/dashboard.types"
import type { DashboardWidgetProps } from "../widget-definition"
import {
  SeedSelect,
  FormulaEditor,
  WindowSelect,
  TextField,
  VariantSelect,
  SwitchField,
} from "../../builder/config-fields"

type TranslateFn = ReturnType<typeof useTranslation>["t"]

const aggregateFormulaSchema = z.union([
  z.object({ op: z.literal("count") }),
  z.object({ op: z.literal("sum"), column: z.string() }),
  z.object({ op: z.literal("avg"), column: z.string() }),
  z.object({ op: z.literal("min"), column: z.string() }),
  z.object({ op: z.literal("max"), column: z.string() }),
  z.object({ op: z.literal("countWhere"), column: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("percentageOf"), numeratorColumn: z.string(), denominatorColumn: z.string() }),
])

export const timeWindowSchema = z.enum(["week", "month", "year", "all"])

export const statConfigSchema = z.object({
  statKey: z.enum(["total", "visitors", "traffic", "storage"]).optional(),
  seedSlug: z.string().optional(),
  formula: aggregateFormulaSchema.optional(),
  window: timeWindowSchema.optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  showTrend: z.boolean().optional(),
}).catch({ statKey: "total" })

export type StatConfig = z.infer<typeof statConfigSchema>

interface StatDataBundle {
  statsData: DashboardStats | undefined
  cfData: CloudflareStats | undefined
  statsLoading: boolean
  cfLoading: boolean
}

type StatKey = "total" | "visitors" | "traffic" | "storage"

function getStatData(key: StatKey, data: StatDataBundle, t: TranslateFn) {
  const { statsData, cfData, statsLoading, cfLoading } = data

  switch (key) {
    case "total":
      return {
        title: t("dashboard.widgets.stat.total.title"),
        value: statsLoading ? "..." : statsData?.total.toLocaleString() ?? "0",
        icon: FileText,
        description: t("dashboard.widgets.stat.total.description"),
        trend: statsData?.total
          ? { value: Math.round((statsData.month / statsData.total) * 100), isPositive: true }
          : undefined,
      }
    case "visitors":
      return {
        title: t("dashboard.widgets.stat.visitors.title"),
        value: cfLoading ? "..." : cfData?.visitors.value.toLocaleString() ?? "0",
        icon: Globe,
        description: t("dashboard.widgets.stat.visitors.description"),
        trend: cfData?.visitors.trend
          ? { value: cfData.visitors.trend, isPositive: cfData.visitors.isPositive }
          : undefined,
      }
    case "traffic":
      return {
        title: t("dashboard.widgets.stat.traffic.title"),
        value: cfLoading ? "..." : `${cfData?.bandwidth.value} ${cfData?.bandwidth.unit}`,
        icon: Zap,
        description: t("dashboard.widgets.stat.traffic.description"),
        trend: cfData?.bandwidth.trend
          ? { value: cfData.bandwidth.trend, isPositive: cfData.bandwidth.isPositive }
          : undefined,
      }
    case "storage":
      return {
        title: t("dashboard.widgets.storage.title"),
        value: cfLoading ? "..." : `${cfData?.storage.used} ${cfData?.storage.unit}`,
        icon: Database,
        description: cfLoading
          ? t("common.loading")
          : t("dashboard.widgets.stat.storage.description", {
              percentage: cfData?.storage.percentage,
              total: Math.round((cfData?.storage.limit ?? 0) / 1024),
            }),
        trend: cfData ? { value: cfData.storage.percentage, isPositive: false } : undefined,
      }
  }
}

export function StatWidgetAdapter({ instance, config }: DashboardWidgetProps<StatConfig>) {
  const { t } = useTranslation()
  const { data: statsData, isLoading: statsLoading } = useDashboardStats()
  const { data: cfData, isLoading: cfLoading } = useCloudflareStats()

  if (config.seedSlug) {
    return (
      <StatWidget
        config={{
          seedSlug: config.seedSlug,
          formula: config.formula,
          window: config.window,
          label: instance.title || config.label,
          icon: config.icon,
          showTrend: config.showTrend,
        }}
      />
    )
  }

  const statData = getStatData(config.statKey ?? "total", { statsData, cfData, statsLoading, cfLoading }, t)
  const mappedTrend = statData.trend ? {
    value: statData.trend.value,
    direction: statData.trend.isPositive ? ("up" as const) : ("down" as const)
  } : undefined
  return <StatCard {...statData} trend={mappedTrend} title={instance.title || statData.title} />
}

const STAT_KEY_OPTIONS = [
  { value: "total", labelKey: "dashboard.widgets.stat.total.title" },
  { value: "visitors", labelKey: "dashboard.widgets.stat.visitors.title" },
  { value: "traffic", labelKey: "dashboard.widgets.stat.traffic.title" },
  { value: "storage", labelKey: "dashboard.widgets.storage.title" },
]

export function StatConfigPanel({ config, onChange }: { config: StatConfig; onChange: (next: StatConfig) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      {config.seedSlug ? (
        <>
          <FormulaEditor
            seedSlug={config.seedSlug}
            value={config.formula}
            onChange={(formula) => onChange({ ...config, formula })}
          />
          <WindowSelect value={config.window} onChange={(window) => onChange({ ...config, window })} />
          <TextField
            label={t("dashboard.builder.config.title")}
            value={config.label}
            onChange={(label) => onChange({ ...config, label })}
          />
        </>
      ) : (
        <VariantSelect
          label={t("dashboard.builder.config.statKey")}
          value={config.statKey ?? "total"}
          options={STAT_KEY_OPTIONS}
          onChange={(statKey) => onChange({ ...config, statKey: statKey as StatConfig["statKey"] })}
        />
      )}
      <SwitchField
        label={t("dashboard.builder.config.showTrend")}
        checked={config.showTrend ?? false}
        onChange={(showTrend) => onChange({ ...config, showTrend })}
      />
    </div>
  )
}
