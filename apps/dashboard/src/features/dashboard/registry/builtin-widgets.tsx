// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// This module's only purpose is the `registerWidget()` side effects below;
// the per-widget adapter components are intentionally not exported.
/* eslint-disable react-refresh/only-export-components */

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { z } from "zod"
import { FileText, Globe, Zap, Database, LineChart, BarChart3, AreaChart } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Seed } from "@beechcms/core"
import { useSchema } from "@/features/schema"
import { registerWidget } from "./widget-registry"
import type { DashboardWidgetProps } from "./widget-definition"
import { useDashboardStats, useCloudflareStats } from "../hooks/use-dashboard-stats"
import type { DashboardStats, CloudflareStats } from "../types/dashboard.types"
import { StatCard } from "../components/stat-card"
import { StatWidget } from "../components/widgets/stat-widget"
import { TimeseriesChartWidget } from "../components/widgets/timeseries-chart-widget"
import type { TimeseriesChartKind } from "../components/widgets/timeseries-chart-widget"
import { PieChartWidget } from "../components/widgets/pie-chart-widget"
import { DataTableWidget } from "../components/widgets/data-table-widget"
import { TextWidget } from "../components/widgets/text-widget"
import { RecentActivity } from "../components/recent-activity"
import { SystemHealth } from "../components/system-health"
import { ContentPulse } from "../components/content-pulse"
import { AIInsights } from "../components/ai-insights"
import { QuickActions } from "../components/quick-actions"
import {
  RecentContentWidget,
  QuickDraftWidget,
  PendingDraftsWidget,
  PublicationStatsWidget,
  SiteStatusWidget,
  StorageWidget,
  MediaGalleryWidget,
  ActivityFeedWidget,
  SetupChecklistWidget,
} from "../components/widgets"
import {
  SeedSelect,
  BranchAliasSelect,
  WindowSelect,
  FormulaEditor,
  TextField,
  TextAreaField,
  NumberField,
  SwitchField,
  VariantSelect,
} from "../builder/config-fields"

const EMPTY_SEEDS: Seed[] = []

type TranslateFn = ReturnType<typeof useTranslation>["t"]

// ---------------------------------------------------------------------------
// Shared "no config" schema for static widgets
// ---------------------------------------------------------------------------

const emptyConfigSchema = z.object({})
type EmptyConfig = z.infer<typeof emptyConfigSchema>

// ---------------------------------------------------------------------------
// core/stat
// ---------------------------------------------------------------------------

const aggregateFormulaSchema = z.union([
  z.object({ op: z.literal("count") }),
  z.object({ op: z.literal("sum"), column: z.string() }),
  z.object({ op: z.literal("avg"), column: z.string() }),
  z.object({ op: z.literal("min"), column: z.string() }),
  z.object({ op: z.literal("max"), column: z.string() }),
  z.object({ op: z.literal("countWhere"), column: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("percentageOf"), numeratorColumn: z.string(), denominatorColumn: z.string() }),
])

const timeWindowSchema = z.enum(["week", "month", "year", "all"])

const statConfigSchema = z.object({
  statKey: z.enum(["total", "visitors", "traffic", "storage"]).optional(),
  seedSlug: z.string().optional(),
  formula: aggregateFormulaSchema.optional(),
  window: timeWindowSchema.optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  showTrend: z.boolean().optional(),
}).catch({ statKey: "total" })
type StatConfig = z.infer<typeof statConfigSchema>

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

function StatWidgetAdapter({ instance, config }: DashboardWidgetProps<StatConfig>) {
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

function StatConfigPanel({ config, onChange }: { config: StatConfig; onChange: (next: StatConfig) => void }) {
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

registerWidget<StatConfig>({
  type: "core/stat",
  labelKey: "dashboard.widgetRegistry.widgets.stat.label",
  icon: "BarChart3",
  category: "stats",
  configSchema: statConfigSchema,
  defaultConfig: { statKey: "total" },
  component: StatWidgetAdapter,
  minColumnSpan: 3,
  ConfigPanel: StatConfigPanel,
})

// ---------------------------------------------------------------------------
// core/line-chart, core/bar-chart, core/area-chart
// ---------------------------------------------------------------------------

const timeseriesChartConfigSchema = z.object({
  seedSlug: z.string(),
  formula: aggregateFormulaSchema.optional(),
  window: timeWindowSchema.optional(),
  groupColumn: z.string().optional(),
  color: z.string().optional(),
})
type TimeseriesChartWidgetConfig = z.infer<typeof timeseriesChartConfigSchema>

function makeTimeseriesChartAdapter(kind: TimeseriesChartKind, labelKey: string, icon: LucideIcon) {
  return function TimeseriesChartAdapter({ instance, config }: DashboardWidgetProps<TimeseriesChartWidgetConfig>) {
    const { t } = useTranslation()
    return <TimeseriesChartWidget config={config} kind={kind} title={instance.title || t(labelKey)} icon={icon} />
  }
}

function TimeseriesChartConfigPanel({
  config,
  onChange,
}: {
  config: TimeseriesChartWidgetConfig
  onChange: (next: TimeseriesChartWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <FormulaEditor
        seedSlug={config.seedSlug}
        value={config.formula}
        onChange={(formula) => onChange({ ...config, formula })}
      />
      <WindowSelect value={config.window} onChange={(window) => onChange({ ...config, window })} />
      <BranchAliasSelect
        seedSlug={config.seedSlug}
        value={config.groupColumn}
        onChange={(groupColumn) => onChange({ ...config, groupColumn })}
        label={t("dashboard.builder.config.groupColumn")}
      />
      <TextField
        label={t("dashboard.builder.config.color")}
        value={config.color}
        onChange={(color) => onChange({ ...config, color })}
        placeholder="#3b82f6"
      />
    </div>
  )
}

registerWidget<TimeseriesChartWidgetConfig>({
  type: "core/line-chart",
  labelKey: "dashboard.widgetRegistry.widgets.lineChart.label",
  icon: "LineChart",
  category: "charts",
  configSchema: timeseriesChartConfigSchema,
  defaultConfig: { seedSlug: "" },
  component: makeTimeseriesChartAdapter("line", "dashboard.widgetRegistry.widgets.lineChart.label", LineChart),
  minColumnSpan: 4,
  ConfigPanel: TimeseriesChartConfigPanel,
})

registerWidget<TimeseriesChartWidgetConfig>({
  type: "core/bar-chart",
  labelKey: "dashboard.widgetRegistry.widgets.barChart.label",
  icon: "BarChart3",
  category: "charts",
  configSchema: timeseriesChartConfigSchema,
  defaultConfig: { seedSlug: "" },
  component: makeTimeseriesChartAdapter("bar", "dashboard.widgetRegistry.widgets.barChart.label", BarChart3),
  minColumnSpan: 4,
  ConfigPanel: TimeseriesChartConfigPanel,
})

registerWidget<TimeseriesChartWidgetConfig>({
  type: "core/area-chart",
  labelKey: "dashboard.widgetRegistry.widgets.areaChart.label",
  icon: "AreaChart",
  category: "charts",
  configSchema: timeseriesChartConfigSchema,
  defaultConfig: { seedSlug: "" },
  component: makeTimeseriesChartAdapter("area", "dashboard.widgetRegistry.widgets.areaChart.label", AreaChart),
  minColumnSpan: 4,
  ConfigPanel: TimeseriesChartConfigPanel,
})

// ---------------------------------------------------------------------------
// core/pie-chart
// ---------------------------------------------------------------------------

const pieChartConfigSchema = z.object({
  seedSlug: z.string(),
  column: z.string(),
  window: timeWindowSchema.optional(),
  donut: z.boolean().optional(),
  limit: z.number().optional(),
})
type PieChartWidgetConfig = z.infer<typeof pieChartConfigSchema>

function PieChartAdapter({ instance, config }: DashboardWidgetProps<PieChartWidgetConfig>) {
  const { t } = useTranslation()
  return <PieChartWidget config={config} title={instance.title || t("dashboard.widgetRegistry.widgets.pieChart.label")} />
}

function PieChartConfigPanel({
  config,
  onChange,
}: {
  config: PieChartWidgetConfig
  onChange: (next: PieChartWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <BranchAliasSelect
        seedSlug={config.seedSlug}
        value={config.column}
        onChange={(column) => onChange({ ...config, column })}
      />
      <WindowSelect value={config.window} onChange={(window) => onChange({ ...config, window })} />
      <SwitchField
        label={t("dashboard.builder.config.donut")}
        checked={config.donut ?? false}
        onChange={(donut) => onChange({ ...config, donut })}
      />
      <NumberField
        label={t("dashboard.builder.config.limit")}
        value={config.limit}
        onChange={(limit) => onChange({ ...config, limit })}
        min={1}
      />
    </div>
  )
}

registerWidget<PieChartWidgetConfig>({
  type: "core/pie-chart",
  labelKey: "dashboard.widgetRegistry.widgets.pieChart.label",
  icon: "PieChart",
  category: "charts",
  configSchema: pieChartConfigSchema,
  defaultConfig: { seedSlug: "", column: "" },
  component: PieChartAdapter,
  minColumnSpan: 4,
  ConfigPanel: PieChartConfigPanel,
})

// ---------------------------------------------------------------------------
// core/data-table
// ---------------------------------------------------------------------------

const dataTableConfigSchema = z.object({
  seedSlug: z.string(),
  columns: z.array(z.string()).optional(),
  pageSize: z.number().optional(),
  orderByColumn: z.string().optional(),
  orderDirection: z.enum(["ASC", "DESC"]).optional(),
})
type DataTableWidgetConfig = z.infer<typeof dataTableConfigSchema>

function DataTableAdapter({ instance, config }: DashboardWidgetProps<DataTableWidgetConfig>) {
  return <DataTableWidget config={config} title={instance.title} />
}

const ORDER_DIRECTION_OPTIONS = [
  { value: "ASC", labelKey: "dashboard.builder.config.variants.asc" },
  { value: "DESC", labelKey: "dashboard.builder.config.variants.desc" },
]

function DataTableConfigPanel({
  config,
  onChange,
}: {
  config: DataTableWidgetConfig
  onChange: (next: DataTableWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <TextField
        label={t("dashboard.builder.config.columns")}
        value={(config.columns ?? []).join(", ")}
        onChange={(value) =>
          onChange({ ...config, columns: value.split(",").map((c) => c.trim()).filter(Boolean) })
        }
        placeholder={t("dashboard.builder.config.columnsPlaceholder")}
      />
      <NumberField
        label={t("dashboard.builder.config.pageSize")}
        value={config.pageSize}
        onChange={(pageSize) => onChange({ ...config, pageSize })}
        min={1}
      />
      <BranchAliasSelect
        seedSlug={config.seedSlug}
        value={config.orderByColumn}
        onChange={(orderByColumn) => onChange({ ...config, orderByColumn })}
        label={t("dashboard.builder.config.orderByColumn")}
      />
      <VariantSelect
        label={t("dashboard.builder.config.orderDirection")}
        value={config.orderDirection ?? "ASC"}
        options={ORDER_DIRECTION_OPTIONS}
        onChange={(orderDirection) => onChange({ ...config, orderDirection: orderDirection as "ASC" | "DESC" })}
      />
    </div>
  )
}

registerWidget<DataTableWidgetConfig>({
  type: "core/data-table",
  labelKey: "dashboard.widgetRegistry.widgets.dataTable.label",
  icon: "Table",
  category: "content",
  configSchema: dataTableConfigSchema,
  defaultConfig: { seedSlug: "" },
  component: DataTableAdapter,
  minColumnSpan: 4,
  ConfigPanel: DataTableConfigPanel,
})

// ---------------------------------------------------------------------------
// core/text
// ---------------------------------------------------------------------------

const textConfigSchema = z.object({
  content: z.string().catch(""),
  align: z.enum(["left", "center"]).optional(),
})
type TextWidgetConfig = z.infer<typeof textConfigSchema>

function TextAdapter({ config }: DashboardWidgetProps<TextWidgetConfig>) {
  return <TextWidget config={config} />
}

const TEXT_ALIGN_OPTIONS = [
  { value: "left", labelKey: "dashboard.builder.config.variants.left" },
  { value: "center", labelKey: "dashboard.builder.config.variants.center" },
]

function TextConfigPanel({
  config,
  onChange,
}: {
  config: TextWidgetConfig
  onChange: (next: TextWidgetConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <TextAreaField
        label={t("dashboard.builder.config.content")}
        value={config.content}
        onChange={(content) => onChange({ ...config, content })}
      />
      <VariantSelect
        label={t("dashboard.builder.config.align")}
        value={config.align ?? "left"}
        options={TEXT_ALIGN_OPTIONS}
        onChange={(align) => onChange({ ...config, align: align as "left" | "center" })}
      />
    </div>
  )
}

registerWidget<TextWidgetConfig>({
  type: "core/text",
  labelKey: "dashboard.widgetRegistry.widgets.text.label",
  icon: "Type",
  category: "system",
  configSchema: textConfigSchema,
  defaultConfig: { content: "" },
  component: TextAdapter,
  minColumnSpan: 2,
  ConfigPanel: TextConfigPanel,
})

// ---------------------------------------------------------------------------
// core/recent-activity
// ---------------------------------------------------------------------------

function RecentActivityAdapter() {
  return <RecentActivity />
}

registerWidget<EmptyConfig>({
  type: "core/recent-activity",
  labelKey: "dashboard.widgetRegistry.widgets.recentActivity.label",
  icon: "History",
  category: "content",
  configSchema: emptyConfigSchema,
  defaultConfig: {},
  component: RecentActivityAdapter,
  minColumnSpan: 6,
})

// ---------------------------------------------------------------------------
// core/system-health
// ---------------------------------------------------------------------------

function SystemHealthAdapter() {
  return <SystemHealth />
}

registerWidget<EmptyConfig>({
  type: "core/system-health",
  labelKey: "dashboard.widgetRegistry.widgets.systemHealth.label",
  icon: "HeartPulse",
  category: "system",
  configSchema: emptyConfigSchema,
  defaultConfig: {},
  component: SystemHealthAdapter,
  minColumnSpan: 4,
})

// ---------------------------------------------------------------------------
// core/content-pulse
// ---------------------------------------------------------------------------

function ContentPulseAdapter() {
  return <ContentPulse />
}

registerWidget<EmptyConfig>({
  type: "core/content-pulse",
  labelKey: "dashboard.widgetRegistry.widgets.contentPulse.label",
  icon: "PieChart",
  category: "charts",
  configSchema: emptyConfigSchema,
  defaultConfig: {},
  component: ContentPulseAdapter,
  minColumnSpan: 4,
})

// ---------------------------------------------------------------------------
// core/ai-insights
// ---------------------------------------------------------------------------

function AIInsightsAdapter() {
  return <AIInsights />
}

registerWidget<EmptyConfig>({
  type: "core/ai-insights",
  labelKey: "dashboard.widgetRegistry.widgets.aiInsights.label",
  icon: "Sparkles",
  category: "content",
  configSchema: emptyConfigSchema,
  defaultConfig: {},
  component: AIInsightsAdapter,
  minColumnSpan: 4,
})

// ---------------------------------------------------------------------------
// core/quick-actions
// ---------------------------------------------------------------------------

function QuickActionsAdapter() {
  const navigate = useNavigate()
  return (
    <QuickActions
      onAction={(action) => {
        if (action === "new-entry") navigate("/content/create-new")
        else if (action === "settings") navigate("/settings")
      }}
    />
  )
}

registerWidget<EmptyConfig>({
  type: "core/quick-actions",
  labelKey: "dashboard.widgetRegistry.widgets.quickActions.label",
  icon: "Zap",
  category: "content",
  configSchema: emptyConfigSchema,
  defaultConfig: {},
  component: QuickActionsAdapter,
  minColumnSpan: 3,
})

// ---------------------------------------------------------------------------
// core/recent-content
// ---------------------------------------------------------------------------

const recentContentConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["list", "cards"]).optional().catch(undefined),
})
type RecentContentConfig = z.infer<typeof recentContentConfigSchema>

function RecentContentAdapter({ instance, config }: DashboardWidgetProps<RecentContentConfig>) {
  return <RecentContentWidget seedSlug={config.seedSlug} variant={config.variant} title={instance.title} />
}

const RECENT_CONTENT_VARIANT_OPTIONS = [
  { value: "list", labelKey: "dashboard.builder.config.variants.list" },
  { value: "cards", labelKey: "dashboard.builder.config.variants.cards" },
]

function RecentContentConfigPanel({
  config,
  onChange,
}: {
  config: RecentContentConfig
  onChange: (next: RecentContentConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "list"}
        options={RECENT_CONTENT_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "list" | "cards" })}
      />
    </div>
  )
}

registerWidget<RecentContentConfig>({
  type: "core/recent-content",
  labelKey: "dashboard.widgetRegistry.widgets.recentContent.label",
  icon: "Clock",
  category: "content",
  configSchema: recentContentConfigSchema,
  defaultConfig: { seedSlug: "", variant: "list" },
  component: RecentContentAdapter,
  minColumnSpan: 6,
  ConfigPanel: RecentContentConfigPanel,
})

// ---------------------------------------------------------------------------
// core/quick-draft
// ---------------------------------------------------------------------------

const quickDraftConfigSchema = z.object({
  variant: z.enum(["minimal", "expanded"]).optional().catch(undefined),
})
type QuickDraftConfig = z.infer<typeof quickDraftConfigSchema>

function QuickDraftAdapter({ config }: DashboardWidgetProps<QuickDraftConfig>) {
  const { data: seeds = EMPTY_SEEDS } = useSchema()
  const seedOptions = useMemo(
    () =>
      seeds.map((seed) => {
        const nameBranch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
        return {
          slug: seed.slug,
          label: seed.label,
          displayNameAlias: seed.displayNameAlias,
          displayNameLabel: nameBranch?.label ?? seed.displayNameAlias,
        }
      }),
    [seeds],
  )
  return <QuickDraftWidget seeds={seedOptions} variant={config.variant} />
}

const QUICK_DRAFT_VARIANT_OPTIONS = [
  { value: "minimal", labelKey: "dashboard.builder.config.variants.minimal" },
  { value: "expanded", labelKey: "dashboard.builder.config.variants.expanded" },
]

function QuickDraftConfigPanel({
  config,
  onChange,
}: {
  config: QuickDraftConfig
  onChange: (next: QuickDraftConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "minimal"}
      options={QUICK_DRAFT_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "minimal" | "expanded" })}
    />
  )
}

registerWidget<QuickDraftConfig>({
  type: "core/quick-draft",
  labelKey: "dashboard.widgetRegistry.widgets.quickDraft.label",
  icon: "FilePlus",
  category: "content",
  configSchema: quickDraftConfigSchema,
  defaultConfig: { variant: "minimal" },
  component: QuickDraftAdapter,
  minColumnSpan: 3,
  ConfigPanel: QuickDraftConfigPanel,
})

// ---------------------------------------------------------------------------
// core/pending-drafts
// ---------------------------------------------------------------------------

const pendingDraftsConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["counter", "list"]).optional().catch(undefined),
})
type PendingDraftsConfig = z.infer<typeof pendingDraftsConfigSchema>

function PendingDraftsAdapter({ instance, config }: DashboardWidgetProps<PendingDraftsConfig>) {
  return <PendingDraftsWidget seedSlug={config.seedSlug} variant={config.variant} title={instance.title} />
}

const PENDING_DRAFTS_VARIANT_OPTIONS = [
  { value: "counter", labelKey: "dashboard.builder.config.variants.counter" },
  { value: "list", labelKey: "dashboard.builder.config.variants.list" },
]

function PendingDraftsConfigPanel({
  config,
  onChange,
}: {
  config: PendingDraftsConfig
  onChange: (next: PendingDraftsConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "list"}
        options={PENDING_DRAFTS_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "counter" | "list" })}
      />
    </div>
  )
}

registerWidget<PendingDraftsConfig>({
  type: "core/pending-drafts",
  labelKey: "dashboard.widgetRegistry.widgets.pendingDrafts.label",
  icon: "ClipboardList",
  category: "content",
  configSchema: pendingDraftsConfigSchema,
  defaultConfig: { seedSlug: "", variant: "list" },
  component: PendingDraftsAdapter,
  minColumnSpan: 4,
  ConfigPanel: PendingDraftsConfigPanel,
})

// ---------------------------------------------------------------------------
// core/publication-stats
// ---------------------------------------------------------------------------

const publicationStatsConfigSchema = z.object({
  variant: z.enum(["trio", "single"]).optional().catch(undefined),
})
type PublicationStatsConfig = z.infer<typeof publicationStatsConfigSchema>

function PublicationStatsAdapter({ config }: DashboardWidgetProps<PublicationStatsConfig>) {
  return <PublicationStatsWidget variant={config.variant} />
}

const PUBLICATION_STATS_VARIANT_OPTIONS = [
  { value: "trio", labelKey: "dashboard.builder.config.variants.trio" },
  { value: "single", labelKey: "dashboard.builder.config.variants.single" },
]

function PublicationStatsConfigPanel({
  config,
  onChange,
}: {
  config: PublicationStatsConfig
  onChange: (next: PublicationStatsConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "trio"}
      options={PUBLICATION_STATS_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "trio" | "single" })}
    />
  )
}

registerWidget<PublicationStatsConfig>({
  type: "core/publication-stats",
  labelKey: "dashboard.widgetRegistry.widgets.publicationStats.label",
  icon: "BarChart3",
  category: "stats",
  configSchema: publicationStatsConfigSchema,
  defaultConfig: { variant: "trio" },
  component: PublicationStatsAdapter,
  minColumnSpan: 3,
  ConfigPanel: PublicationStatsConfigPanel,
})

// ---------------------------------------------------------------------------
// core/site-status
// ---------------------------------------------------------------------------

const siteStatusConfigSchema = z.object({
  variant: z.enum(["badge", "pill-row"]).optional().catch(undefined),
})
type SiteStatusConfig = z.infer<typeof siteStatusConfigSchema>

function SiteStatusAdapter({ config }: DashboardWidgetProps<SiteStatusConfig>) {
  return <SiteStatusWidget variant={config.variant} />
}

const SITE_STATUS_VARIANT_OPTIONS = [
  { value: "badge", labelKey: "dashboard.builder.config.variants.badge" },
  { value: "pill-row", labelKey: "dashboard.builder.config.variants.pillRow" },
]

function SiteStatusConfigPanel({
  config,
  onChange,
}: {
  config: SiteStatusConfig
  onChange: (next: SiteStatusConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "badge"}
      options={SITE_STATUS_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "badge" | "pill-row" })}
    />
  )
}

registerWidget<SiteStatusConfig>({
  type: "core/site-status",
  labelKey: "dashboard.widgetRegistry.widgets.siteStatus.label",
  icon: "Wifi",
  category: "system",
  configSchema: siteStatusConfigSchema,
  defaultConfig: { variant: "badge" },
  component: SiteStatusAdapter,
  minColumnSpan: 2,
  ConfigPanel: SiteStatusConfigPanel,
})

// ---------------------------------------------------------------------------
// core/storage
// ---------------------------------------------------------------------------

const storageConfigSchema = z.object({
  variant: z.enum(["bar", "gauge"]).optional().catch(undefined),
  totalBytes: z.number().positive().optional().catch(undefined),
})
type StorageConfig = z.infer<typeof storageConfigSchema>

function StorageAdapter({ config }: DashboardWidgetProps<StorageConfig>) {
  return <StorageWidget variant={config.variant} totalBytes={config.totalBytes} />
}

const STORAGE_VARIANT_OPTIONS = [
  { value: "bar", labelKey: "dashboard.builder.config.variants.bar" },
  { value: "gauge", labelKey: "dashboard.builder.config.variants.gauge" },
]

function StorageConfigPanel({
  config,
  onChange,
}: {
  config: StorageConfig
  onChange: (next: StorageConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "gauge"}
        options={STORAGE_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "bar" | "gauge" })}
      />
      <NumberField
        label={t("dashboard.builder.config.totalBytes")}
        value={config.totalBytes}
        onChange={(totalBytes) => onChange({ ...config, totalBytes })}
        min={1}
      />
    </div>
  )
}

registerWidget<StorageConfig>({
  type: "core/storage",
  labelKey: "dashboard.widgetRegistry.widgets.storage.label",
  icon: "HardDrive",
  category: "system",
  configSchema: storageConfigSchema,
  defaultConfig: { variant: "gauge" },
  component: StorageAdapter,
  minColumnSpan: 2,
  ConfigPanel: StorageConfigPanel,
})

// ---------------------------------------------------------------------------
// core/media-gallery
// ---------------------------------------------------------------------------

const mediaGalleryConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["grid", "unused"]).optional().catch(undefined),
})
type MediaGalleryConfig = z.infer<typeof mediaGalleryConfigSchema>

function MediaGalleryAdapter({ config }: DashboardWidgetProps<MediaGalleryConfig>) {
  return <MediaGalleryWidget seedSlug={config.seedSlug} variant={config.variant} />
}

const MEDIA_GALLERY_VARIANT_OPTIONS = [
  { value: "grid", labelKey: "dashboard.builder.config.variants.grid" },
  { value: "unused", labelKey: "dashboard.builder.config.variants.unused" },
]

function MediaGalleryConfigPanel({
  config,
  onChange,
}: {
  config: MediaGalleryConfig
  onChange: (next: MediaGalleryConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "grid"}
        options={MEDIA_GALLERY_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "grid" | "unused" })}
      />
    </div>
  )
}

registerWidget<MediaGalleryConfig>({
  type: "core/media-gallery",
  labelKey: "dashboard.widgetRegistry.widgets.mediaGallery.label",
  icon: "Images",
  category: "content",
  configSchema: mediaGalleryConfigSchema,
  defaultConfig: { seedSlug: "", variant: "grid" },
  component: MediaGalleryAdapter,
  minColumnSpan: 6,
  ConfigPanel: MediaGalleryConfigPanel,
})

// ---------------------------------------------------------------------------
// core/activity-feed
// ---------------------------------------------------------------------------

const activityFeedConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["feed", "compact"]).optional().catch(undefined),
  limit: z.number().int().positive().optional().catch(undefined),
})
type ActivityFeedConfig = z.infer<typeof activityFeedConfigSchema>

function ActivityFeedAdapter({ instance, config }: DashboardWidgetProps<ActivityFeedConfig>) {
  return <ActivityFeedWidget seedSlug={config.seedSlug} variant={config.variant} limit={config.limit} title={instance.title} />
}

const ACTIVITY_FEED_VARIANT_OPTIONS = [
  { value: "feed", labelKey: "dashboard.builder.config.variants.feed" },
  { value: "compact", labelKey: "dashboard.builder.config.variants.compact" },
]

function ActivityFeedConfigPanel({
  config,
  onChange,
}: {
  config: ActivityFeedConfig
  onChange: (next: ActivityFeedConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <SeedSelect value={config.seedSlug} onChange={(seedSlug) => onChange({ ...config, seedSlug })} />
      <VariantSelect
        label={t("dashboard.builder.config.variant")}
        value={config.variant ?? "feed"}
        options={ACTIVITY_FEED_VARIANT_OPTIONS}
        onChange={(variant) => onChange({ ...config, variant: variant as "feed" | "compact" })}
      />
      <NumberField
        label={t("dashboard.builder.config.limit")}
        value={config.limit}
        onChange={(limit) => onChange({ ...config, limit })}
        min={1}
      />
    </div>
  )
}

registerWidget<ActivityFeedConfig>({
  type: "core/activity-feed",
  labelKey: "dashboard.widgetRegistry.widgets.activityFeed.label",
  icon: "Activity",
  category: "content",
  configSchema: activityFeedConfigSchema,
  defaultConfig: { seedSlug: "", variant: "feed" },
  component: ActivityFeedAdapter,
  minColumnSpan: 4,
  ConfigPanel: ActivityFeedConfigPanel,
})

// ---------------------------------------------------------------------------
// core/setup-checklist
// ---------------------------------------------------------------------------

const setupChecklistConfigSchema = z.object({
  variant: z.enum(["full", "compact"]).optional().catch(undefined),
})
type SetupChecklistConfig = z.infer<typeof setupChecklistConfigSchema>

function SetupChecklistAdapter({ config }: DashboardWidgetProps<SetupChecklistConfig>) {
  return <SetupChecklistWidget variant={config.variant} />
}

const SETUP_CHECKLIST_VARIANT_OPTIONS = [
  { value: "full", labelKey: "dashboard.builder.config.variants.full" },
  { value: "compact", labelKey: "dashboard.builder.config.variants.compact" },
]

function SetupChecklistConfigPanel({
  config,
  onChange,
}: {
  config: SetupChecklistConfig
  onChange: (next: SetupChecklistConfig) => void
}) {
  const { t } = useTranslation()
  return (
    <VariantSelect
      label={t("dashboard.builder.config.variant")}
      value={config.variant ?? "full"}
      options={SETUP_CHECKLIST_VARIANT_OPTIONS}
      onChange={(variant) => onChange({ ...config, variant: variant as "full" | "compact" })}
    />
  )
}

registerWidget<SetupChecklistConfig>({
  type: "core/setup-checklist",
  labelKey: "dashboard.widgetRegistry.widgets.setupChecklist.label",
  icon: "ListChecks",
  category: "system",
  configSchema: setupChecklistConfigSchema,
  defaultConfig: { variant: "full" },
  component: SetupChecklistAdapter,
  minColumnSpan: 12,
  ConfigPanel: SetupChecklistConfigPanel,
})
