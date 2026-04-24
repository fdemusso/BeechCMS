import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { formatDistanceToNow } from "date-fns"
import { it as itLocale, enUS, type Locale } from "date-fns/locale"
import { ClipboardList, Send } from "lucide-react"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
import { DASHBOARD_QUERY_KEYS } from "@/features/dashboard/hooks/use-dashboard-stats"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"
import { Link } from "react-router-dom"

export interface PendingDraftsWidgetProps {
  seedSlug: string
  variant?: "counter" | "list"
  onPublish?: (id: string) => void
  onOpen?: (id?: string) => void
}

interface ContentListResponse {
  items: ContentEntry[]
  total: number
}

const DATE_FNS_LOCALE: Record<string, Locale> = { it: itLocale, en: enUS }

function entryTitle(entry: ContentEntry): string {
  for (const val of Object.values(entry.data)) {
    if (typeof val === "string" && val.trim()) return val
  }
  return entry.id
}

export function PendingDraftsWidget({ seedSlug, variant = "list", onPublish, onOpen }: PendingDraftsWidgetProps) {
  const { t, i18n } = useTranslation()
  const dateFnsLocale = DATE_FNS_LOCALE[i18n.language] ?? enUS
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["widget", "pending-drafts", seedSlug],
    queryFn: async (): Promise<ContentEntry[]> => {
      const res = await api.get<ContentListResponse | ContentEntry[]>(`/content/${seedSlug}`, {
        params: { has_pending_draft: 1, limit: 10 },
      })
      const d = res.data
      return Array.isArray(d) ? d : d.items
    },
    staleTime: 3 * 60 * 1000,
  })

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/content/${seedSlug}/${id}/draft/publish`)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget", "pending-drafts", seedSlug] })
      queryClient.invalidateQueries({ queryKey: ["widget", "recent-content", seedSlug] })
      // Invalidate recent-activity so the dashboard feed reflects the publication immediately
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })
    },
  })

  const countBadge = data?.length ? (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800/60 text-xs tabular-nums" variant="outline">
      {data.length}
    </Badge>
  ) : null

  if (isLoading) return (
    <DashboardWidgetShell title={t("dashboard.widgets.pendingDrafts.title")} icon={ClipboardList}>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full animate-pulse" />)}
      </div>
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell title={t("dashboard.widgets.pendingDrafts.title")} icon={ClipboardList}>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (variant === "counter") {
    return (
      <DashboardWidgetShell title={t("dashboard.widgets.pendingDrafts.title")} icon={ClipboardList}>
        <div className="flex flex-col items-center justify-center gap-2 h-full text-center">
          <span className="text-5xl font-bold tabular-nums">{data?.length ?? 0}</span>
          <p className="text-sm text-muted-foreground">{t("dashboard.widgets.pendingDrafts.pendingCount")}</p>
          <Button variant="outline" size="sm" onClick={() => onOpen?.(undefined)}>{t("dashboard.widgets.pendingDrafts.viewAll")}</Button>
        </div>
      </DashboardWidgetShell>
    )
  }

  if (!data?.length) return (
    <DashboardWidgetShell title={t("dashboard.widgets.pendingDrafts.title")} icon={ClipboardList}>
      <WidgetEmpty icon={ClipboardList} title={t("dashboard.widgets.pendingDrafts.noPending")} />
    </DashboardWidgetShell>
  )

  return (
    <DashboardWidgetShell title={t("dashboard.widgets.pendingDrafts.title")} icon={ClipboardList} action={countBadge}>
      <ScrollArea className="h-[260px]">
        <ul className="space-y-1 pr-2">
          {data.map((entry) => (
            <li key={entry.id} className="rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors group">
              {/* Mobile: title + timestamp row, then full-width publish button.
                  sm+: single row with title | timestamp | button. */}
              <div className="flex items-center gap-2 min-w-0">
                <Link
                  to={`/content/${seedSlug}/${entry.id}`}
                  className="flex-1 text-sm font-medium truncate hover:underline text-foreground decoration-primary/30 min-w-0"
                >
                  {entryTitle(entry)}
                </Link>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums hidden sm:inline">
                  {entry.updated_at
                    ? formatDistanceToNow(new Date(entry.updated_at * 1000), { addSuffix: true, locale: dateFnsLocale })
                    : "—"
                  }
                </span>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-xs px-2 shrink-0 gap-1 opacity-70 group-hover:opacity-100 transition-opacity hidden sm:flex"
                  disabled={publishMutation.isPending}
                  onClick={() => {
                    publishMutation.mutate(entry.id)
                    onPublish?.(entry.id)
                  }}
                >
                  <Send className="size-3" />
                  {t("dashboard.widgets.pendingDrafts.publish")}
                </Button>
              </div>
              {/* Mobile-only: timestamp + button on second line */}
              <div className="flex items-center justify-between gap-2 mt-1 sm:hidden">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {entry.updated_at
                    ? formatDistanceToNow(new Date(entry.updated_at * 1000), { addSuffix: true, locale: dateFnsLocale })
                    : "—"
                  }
                </span>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-xs px-2 shrink-0 gap-1"
                  disabled={publishMutation.isPending}
                  onClick={() => {
                    publishMutation.mutate(entry.id)
                    onPublish?.(entry.id)
                  }}
                >
                  <Send className="size-3" />
                  {t("dashboard.widgets.pendingDrafts.publish")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </DashboardWidgetShell>
  )
}
