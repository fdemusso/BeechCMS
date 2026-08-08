// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// This module's only purpose is the `registerWidget()` side effects below;
// the per-widget adapter components are imported from the ./builtin module.
/* eslint-disable react-refresh/only-export-components */

import { z } from "zod"
import { ChartLine as LineChart, ChartBar as BarChart3, Chart as AreaChart } from 'reicon-react'

import { registerWidget } from "./widget-registry"

import { statConfigSchema, StatWidgetAdapter, StatConfigPanel } from "./builtin/stat-adapters"
import type { StatConfig } from "./builtin/stat-adapters"

import {
  timeseriesChartConfigSchema,
  makeTimeseriesChartAdapter,
  TimeseriesChartConfigPanel,
} from "./builtin/timeseries-chart-adapters"
import type { TimeseriesChartWidgetConfig } from "./builtin/timeseries-chart-adapters"

import { pieChartConfigSchema, PieChartAdapter, PieChartConfigPanel } from "./builtin/pie-chart-adapters"
import type { PieChartWidgetConfig } from "./builtin/pie-chart-adapters"

import { dataTableConfigSchema, DataTableAdapter, DataTableConfigPanel } from "./builtin/data-table-adapters"
import type { DataTableWidgetConfig } from "./builtin/data-table-adapters"

import { textConfigSchema, TextAdapter, TextConfigPanel } from "./builtin/text-adapters"
import type { TextWidgetConfig } from "./builtin/text-adapters"

import { RecentActivityAdapter } from "./builtin/recent-activity-adapter"
import { SystemHealthAdapter } from "./builtin/system-health-adapter"
import { ContentPulseAdapter } from "./builtin/content-pulse-adapter"
import { AIInsightsAdapter } from "./builtin/ai-insights-adapter"
import { QuickActionsAdapter } from "./builtin/quick-actions-adapter"

import {
  recentContentConfigSchema,
  RecentContentAdapter,
  RecentContentConfigPanel,
} from "./builtin/recent-content-adapters"
import type { RecentContentConfig } from "./builtin/recent-content-adapters"

import {
  quickDraftConfigSchema,
  QuickDraftAdapter,
  QuickDraftConfigPanel,
} from "./builtin/quick-draft-adapters"
import type { QuickDraftConfig } from "./builtin/quick-draft-adapters"

import {
  pendingDraftsConfigSchema,
  PendingDraftsAdapter,
  PendingDraftsConfigPanel,
} from "./builtin/pending-drafts-adapters"
import type { PendingDraftsConfig } from "./builtin/pending-drafts-adapters"

import {
  publicationStatsConfigSchema,
  PublicationStatsAdapter,
  PublicationStatsConfigPanel,
} from "./builtin/publication-stats-adapters"
import type { PublicationStatsConfig } from "./builtin/publication-stats-adapters"

import {
  siteStatusConfigSchema,
  SiteStatusAdapter,
  SiteStatusConfigPanel,
} from "./builtin/site-status-adapters"
import type { SiteStatusConfig } from "./builtin/site-status-adapters"

import {
  storageConfigSchema,
  StorageAdapter,
  StorageConfigPanel,
} from "./builtin/storage-adapters"
import type { StorageConfig } from "./builtin/storage-adapters"

import {
  mediaGalleryConfigSchema,
  MediaGalleryAdapter,
  MediaGalleryConfigPanel,
} from "./builtin/media-gallery-adapters"
import type { MediaGalleryConfig } from "./builtin/media-gallery-adapters"

import {
  activityFeedConfigSchema,
  ActivityFeedAdapter,
  ActivityFeedConfigPanel,
} from "./builtin/activity-feed-adapters"
import type { ActivityFeedConfig } from "./builtin/activity-feed-adapters"

import {
  setupChecklistConfigSchema,
  SetupChecklistAdapter,
  SetupChecklistConfigPanel,
} from "./builtin/setup-checklist-adapters"
import type { SetupChecklistConfig } from "./builtin/setup-checklist-adapters"

// ---------------------------------------------------------------------------
// Shared "no config" schema for static widgets
// ---------------------------------------------------------------------------

const emptyConfigSchema = z.object({})
type EmptyConfig = z.infer<typeof emptyConfigSchema>

// ---------------------------------------------------------------------------
// core/stat
// ---------------------------------------------------------------------------

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
