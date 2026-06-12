// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Activity, Plus, Pencil, Trash2, Upload } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { it as itLocale, enUS, type Locale } from "date-fns/locale"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell, useRecentActivity } from "@/features/dashboard"
import { cn } from "@/lib/utils"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

export interface ActivityFeedWidgetProps {
  seedSlug?: string
  variant?: "feed" | "compact"
  limit?: number
  title?: string
}

const DATE_FNS_LOCALE: Record<string, Locale> = { it: itLocale, en: enUS }

const ACTION_ICONS: Record<string, React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  upload: Upload,
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  update: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  delete: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  upload: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
}

function displayName(name?: string | null, email?: string, fallback = "User"): string {
  return name || email || fallback
}

function initials(name?: string | null, email?: string): string {
  const source = name || email
  if (!source) return "?"
  return source.slice(0, 2).toUpperCase()
}

export function ActivityFeedWidget({ seedSlug, variant = "feed", title }: ActivityFeedWidgetProps) {
  const { t, i18n } = useTranslation()
  const dateFnsLocale = DATE_FNS_LOCALE[i18n.language] ?? enUS
  const widgetTitle = title || t("dashboard.widgets.activityFeed.title")

  function relativeTime(ts: number | null): string {
    if (!ts) return "—"
    return formatDistanceToNow(new Date(ts * 1000), { addSuffix: true, locale: dateFnsLocale })
  }

  const { data, isLoading, isError, refetch } = useRecentActivity(seedSlug)

  if (isLoading) return (
    <DashboardWidgetShell title={widgetTitle} icon={Activity}>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full animate-pulse" />
            <Skeleton className="h-8 flex-1 animate-pulse" />
          </div>
        ))}
      </div>
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell title={widgetTitle} icon={Activity}>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (!data?.length) return (
    <DashboardWidgetShell title={widgetTitle} icon={Activity}>
      <WidgetEmpty icon={Activity} title={t("dashboard.widgets.activityFeed.empty")} />
    </DashboardWidgetShell>
  )

  if (variant === "compact") {
    const items = data.slice(0, 10)
    return (
      <DashboardWidgetShell title={widgetTitle} icon={Activity}>
        <ScrollArea className="h-full" type="auto">
          <ul className="space-y-1 pr-3">
            {items.map((log) => (
              <li key={log.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground truncate flex-1">
                  <span className="font-medium text-foreground">{displayName(log.user_name, log.user_email)}</span>{" "}
                  {t(`dashboard.recentActivity.actions.${log.action}`, { defaultValue: log.action })}{" "}
                  <span className="font-medium text-foreground">
                    {log.details?.title || log.details?.name || log.entity_slug || log.entity_id}
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">{relativeTime(log.created_at)}</span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell title={widgetTitle} icon={Activity}>
      <ScrollArea className="h-[180px]" type="auto">
        <ul className="space-y-3 pr-3">
          {data.map((log) => {
            const ActionIcon = ACTION_ICONS[log.action] ?? Activity
            const actionColor = ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground"
            return (
              <li key={log.id} className="flex items-start gap-3 group">
                <div className="relative shrink-0">
                  <Avatar className="size-8 border border-border/60">
                    <AvatarFallback className="text-[10px] bg-primary/5 text-primary font-semibold">
                      {initials(log.user_name, log.user_email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full ring-2 ring-background",
                    actionColor
                  )}>
                    <ActionIcon className="size-2.5" />
                  </span>
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm leading-snug">
                    <span className="font-semibold">{displayName(log.user_name, log.user_email)}</span>{" "}
                    <span className="text-muted-foreground">
                      {t(`dashboard.recentActivity.actions.${log.action}`, { defaultValue: log.action })}
                    </span>{" "}
                    <span className="font-medium">
                      {log.details?.title || log.details?.name || log.entity_slug || log.entity_id}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground/70">{relativeTime(log.created_at)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </DashboardWidgetShell>
  )
}
