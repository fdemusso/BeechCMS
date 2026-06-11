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
import { FileText, Globe, Zap, Database } from "lucide-react"
import type { Seed } from "@beechcms/core"
import { useSchema } from "@/features/schema"
import { registerWidget } from "./widget-registry"
import type { DashboardWidgetProps } from "./widget-definition"
import { useDashboardStats, useCloudflareStats } from "../hooks/use-dashboard-stats"
import type { DashboardStats, CloudflareStats } from "../types/dashboard.types"
import { StatCard } from "../components/stat-card"
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

const statConfigSchema = z.object({
  statKey: z.enum(["total", "visitors", "traffic", "storage"]).catch("total"),
})
type StatConfig = z.infer<typeof statConfigSchema>

interface StatDataBundle {
  statsData: DashboardStats | undefined
  cfData: CloudflareStats | undefined
  statsLoading: boolean
  cfLoading: boolean
}

function getStatData(key: StatConfig["statKey"], data: StatDataBundle, t: TranslateFn) {
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

function StatWidgetAdapter({ config }: DashboardWidgetProps<StatConfig>) {
  const { t } = useTranslation()
  const { data: statsData, isLoading: statsLoading } = useDashboardStats()
  const { data: cfData, isLoading: cfLoading } = useCloudflareStats()
  const statData = getStatData(config.statKey, { statsData, cfData, statsLoading, cfLoading }, t)
  return <StatCard {...statData} />
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

function RecentContentAdapter({ config }: DashboardWidgetProps<RecentContentConfig>) {
  return <RecentContentWidget seedSlug={config.seedSlug} variant={config.variant} />
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

registerWidget<QuickDraftConfig>({
  type: "core/quick-draft",
  labelKey: "dashboard.widgetRegistry.widgets.quickDraft.label",
  icon: "FilePlus",
  category: "content",
  configSchema: quickDraftConfigSchema,
  defaultConfig: { variant: "minimal" },
  component: QuickDraftAdapter,
  minColumnSpan: 3,
})

// ---------------------------------------------------------------------------
// core/pending-drafts
// ---------------------------------------------------------------------------

const pendingDraftsConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["counter", "list"]).optional().catch(undefined),
})
type PendingDraftsConfig = z.infer<typeof pendingDraftsConfigSchema>

function PendingDraftsAdapter({ config }: DashboardWidgetProps<PendingDraftsConfig>) {
  return <PendingDraftsWidget seedSlug={config.seedSlug} variant={config.variant} />
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

registerWidget<PublicationStatsConfig>({
  type: "core/publication-stats",
  labelKey: "dashboard.widgetRegistry.widgets.publicationStats.label",
  icon: "BarChart3",
  category: "stats",
  configSchema: publicationStatsConfigSchema,
  defaultConfig: { variant: "trio" },
  component: PublicationStatsAdapter,
  minColumnSpan: 3,
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

registerWidget<SiteStatusConfig>({
  type: "core/site-status",
  labelKey: "dashboard.widgetRegistry.widgets.siteStatus.label",
  icon: "Wifi",
  category: "system",
  configSchema: siteStatusConfigSchema,
  defaultConfig: { variant: "badge" },
  component: SiteStatusAdapter,
  minColumnSpan: 2,
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

registerWidget<StorageConfig>({
  type: "core/storage",
  labelKey: "dashboard.widgetRegistry.widgets.storage.label",
  icon: "HardDrive",
  category: "system",
  configSchema: storageConfigSchema,
  defaultConfig: { variant: "gauge" },
  component: StorageAdapter,
  minColumnSpan: 2,
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

registerWidget<MediaGalleryConfig>({
  type: "core/media-gallery",
  labelKey: "dashboard.widgetRegistry.widgets.mediaGallery.label",
  icon: "Images",
  category: "content",
  configSchema: mediaGalleryConfigSchema,
  defaultConfig: { seedSlug: "", variant: "grid" },
  component: MediaGalleryAdapter,
  minColumnSpan: 6,
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

function ActivityFeedAdapter({ config }: DashboardWidgetProps<ActivityFeedConfig>) {
  return <ActivityFeedWidget seedSlug={config.seedSlug} variant={config.variant} limit={config.limit} />
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

registerWidget<SetupChecklistConfig>({
  type: "core/setup-checklist",
  labelKey: "dashboard.widgetRegistry.widgets.setupChecklist.label",
  icon: "ListChecks",
  category: "system",
  configSchema: setupChecklistConfigSchema,
  defaultConfig: { variant: "full" },
  component: SetupChecklistAdapter,
  minColumnSpan: 12,
})
