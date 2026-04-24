import { useTranslation } from "react-i18next"
import type { WidgetInstance } from "../types/widget.types"
import { WidgetErrorBoundary } from "./widget-error-boundary"
import { RecentActivity } from "./recent-activity"
import { SystemHealth } from "./system-health"
import { ContentPulse } from "./content-pulse"
import { AIInsights } from "./ai-insights"
import { QuickActions } from "./quick-actions"
import { StatCard } from "./stat-card"
import { FileText, Globe, Zap, Database } from "lucide-react"
import {
  RecentContentWidget,
  QuickDraftWidget,
  PendingDraftsWidget,
  PublicationStatsWidget,
  SiteStatusWidget,
  StorageWidget,
  MediaGalleryWidget,
  ActivityFeedWidget,
} from "./widgets"

interface WidgetRegistryProps {
  instance: WidgetInstance
  data?: any // Generic data bundle passed from DashboardPage
}

/**
 * WidgetRegistry — resolves a widget `type` string to its React component,
 * wraps it in a WidgetErrorBoundary so a single crashing widget never
 * brings down the whole dashboard.
 *
 * To register a new widget:
 *   1. Add its type to `WidgetType` in `types/widget.types.ts`
 *   2. Add a `case` here that returns the component
 *   3. Add an instance to `config/dashboard.config.ts`
 */
export function WidgetRegistry({ instance, data }: WidgetRegistryProps) {
  return (
    <WidgetErrorBoundary widgetId={instance.id}>
      <WidgetContent instance={instance} data={data} />
    </WidgetErrorBoundary>
  )
}

// Separated so the error boundary can catch rendering errors in children
function WidgetContent({ instance, data }: WidgetRegistryProps) {
  const { type, props } = instance
  const { t } = useTranslation()

  if (type === "stat") {
    const statData = getStatData(props?.statKey, data, t)
    return <StatCard {...statData} />
  }

  if (type === "recent-activity") return <RecentActivity />
  if (type === "system-health") return <SystemHealth />
  if (type === "content-pulse") return <ContentPulse />
  if (type === "ai-insights") return <AIInsights />
  if (type === "quick-actions") {
    return <QuickActions onAction={(action) => console.log("[BeechCMS] Quick action:", action)} />
  }

  // ── New widgets (v2) ────────────────────────────────────────────────────────
  if (type === "recent-content") {
    return (
      <RecentContentWidget
        seedSlug={props?.seedSlug ?? ""}
        variant={props?.variant}
        onOpen={props?.onOpen}
      />
    )
  }
  if (type === "quick-draft") {
    return (
      <QuickDraftWidget
        seeds={props?.seeds ?? []}
        variant={props?.variant}
        onCreated={props?.onCreated}
      />
    )
  }
  if (type === "pending-drafts") {
    return (
      <PendingDraftsWidget
        seedSlug={props?.seedSlug ?? ""}
        variant={props?.variant}
        onPublish={props?.onPublish}
        onOpen={props?.onOpen}
      />
    )
  }
  if (type === "publication-stats") {
    return <PublicationStatsWidget variant={props?.variant} />
  }
  if (type === "site-status") {
    return <SiteStatusWidget variant={props?.variant} />
  }
  if (type === "storage") {
    return <StorageWidget variant={props?.variant} totalBytes={props?.totalBytes} />
  }
  if (type === "media-gallery") {
    return (
      <MediaGalleryWidget
        seedSlug={props?.seedSlug ?? ""}
        variant={props?.variant}
        onOpen={props?.onOpen}
      />
    )
  }
  if (type === "activity-feed") {
    return (
      <ActivityFeedWidget
        seedSlug={props?.seedSlug ?? ""}
        variant={props?.variant}
        limit={props?.limit}
      />
    )
  }

  // Fallback: unknown widget type (developer debugging aid)
  return (
    <div className="flex h-full min-h-[80px] items-center justify-center rounded-xl border-2 border-dashed border-muted p-4">
      <p className="text-sm text-muted-foreground">
        {t("dashboard.widgetRegistry.unknown")}{" "}
        <span className="font-mono font-semibold">{type}</span>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat data helpers
// ---------------------------------------------------------------------------

function getStatData(key: string, data: any, t: (key: string, opts?: Record<string, unknown>) => string) {
  const { statsData, cfData, statsLoading, cfLoading } = data || {}

  switch (key) {
    case "total":
      return {
        title: t("dashboard.widgets.stat.total.title"),
        value: statsLoading ? "..." : statsData?.total.toLocaleString() ?? "0",
        icon: FileText,
        description: t("dashboard.widgets.stat.total.description"),
        trend: statsData?.total
          ? { value: Math.round((statsData.recent / statsData.total) * 100), isPositive: true }
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
    default:
      return { title: "N/A", value: "0", icon: FileText }
  }
}
