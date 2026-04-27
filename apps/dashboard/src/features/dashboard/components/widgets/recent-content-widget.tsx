import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { formatDistanceToNow } from "date-fns"
import { it as itLocale, enUS, type Locale } from "date-fns/locale"
import { Clock, FileImage } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"
import { Link } from "react-router-dom"
import { ScrollArea } from "@/components/ui/scroll-area"

const DATE_FNS_LOCALE: Record<string, Locale> = { it: itLocale, en: enUS }

const DATE_FNS_LOCALE: Record<string, Locale> = { it: itLocale, en: enUS }

export interface RecentContentWidgetProps {
  seedSlug: string
  variant?: "list" | "cards"
  onOpen?: (id: string) => void
}

function statusVariant(status: string): string {
  if (status === "published") return "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800/60"
  if (status === "draft") return "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800/60"
  return "bg-neutral-100 text-neutral-600 border-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-400"
}

function entryTitle(entry: ContentEntry): string {
  const data = entry.data
  for (const key of Object.keys(data)) {
    const val = data[key]
    if (typeof val === "string" && val.trim()) return val
  }
  return entry.id
}

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|avif|svg)(\?.*)?$/i

function entryImageUrl(entry: ContentEntry): string | null {
  for (const val of Object.values(entry.data)) {
    if (
      typeof val === "string" &&
      (val.startsWith("http") || IMAGE_EXTENSIONS.test(val))
    ) {
      return val
    }
  }
  return null
}

interface ContentListResponse {
  items: ContentEntry[]
  total: number
}

export function RecentContentWidget({ seedSlug, variant = "list" }: RecentContentWidgetProps) {
  const { t, i18n } = useTranslation()
  const dateFnsLocale = DATE_FNS_LOCALE[i18n.language] ?? enUS

  function relativeTime(ts: number | null): string {
    if (!ts) return "—"
    return formatDistanceToNow(new Date(ts * 1000), { addSuffix: true, locale: dateFnsLocale })
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["widget", "recent-content", seedSlug],
    queryFn: async (): Promise<ContentEntry[]> => {
      const res = await api.get<ContentListResponse | ContentEntry[]>(`/content/${seedSlug}`, {
        params: { limit: 5, sortBy: "updated_at", sortDir: "desc" },
      })
      const d = res.data
      return Array.isArray(d) ? d : d.items
    },
    staleTime: 3 * 60 * 1000,
  })

  const viewAllAction = (
    <Link
      to={`/content/${seedSlug}`}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {t("dashboard.widgets.recentContent.viewAll")}
    </Link>
  )

  if (isLoading) return (
    <DashboardWidgetShell title={t("dashboard.widgets.recentContent.title")} icon={Clock} action={viewAllAction}>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg animate-pulse" />
        ))}
      </div>
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell title={t("dashboard.widgets.recentContent.title")} icon={Clock} action={viewAllAction}>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (!data?.length) return (
    <DashboardWidgetShell title={t("dashboard.widgets.recentContent.title")} icon={Clock}>
      <WidgetEmpty icon={FileImage} title={t("dashboard.widgets.recentContent.noContent")} description={t("dashboard.widgets.recentContent.noContentDesc")} />
    </DashboardWidgetShell>
  )

  if (variant === "cards") {
    return (
      <DashboardWidgetShell title={t("dashboard.widgets.recentContent.title")} icon={Clock} action={viewAllAction}>
        <ScrollArea className="h-full">
          <div className="grid grid-cols-2 gap-3 pr-2">
            {data.map((entry) => {
              const imageUrl = entryImageUrl(entry)
              return (
                <Link
                  key={entry.id}
                  to={`/content/${seedSlug}/${entry.id}`}
                  className="flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-28 w-full object-cover shrink-0" />
                  ) : (
                    <div className="h-28 shrink-0 bg-muted flex items-center justify-center">
                      <FileImage className="size-7 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="flex flex-col flex-1 p-2">
                    <p className="text-xs font-medium line-clamp-2 flex-1">{entryTitle(entry)}</p>
                    <div className="flex items-center justify-between gap-1 mt-auto pt-2">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold border", statusVariant(entry.status))}>{entry.status}</span>
                      <span className="text-[10px] text-muted-foreground">{relativeTime(entry.updated_at)}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </ScrollArea>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell title={t("dashboard.widgets.recentContent.title")} icon={Clock} action={viewAllAction}>
      <ul className="space-y-0.5">
        {data.map((entry) => (
          <li
            key={entry.id}
            className="group rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
          >
            {/* Mobile: title on its own line, meta row below.
                sm+: single row with all three items. */}
            <Link
              to={`/content/${seedSlug}/${entry.id}`}
              className="text-sm font-medium truncate block hover:underline decoration-primary/30 mb-1 sm:hidden"
            >
              {entryTitle(entry)}
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to={`/content/${seedSlug}/${entry.id}`}
                className="text-sm font-medium truncate flex-1 hover:underline decoration-primary/30 hidden sm:block"
              >
                {entryTitle(entry)}
              </Link>
              <Badge className={cn("shrink-0 text-[10px] border", statusVariant(entry.status))} variant="outline">
                {entry.status}
              </Badge>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums ml-auto sm:ml-0">{relativeTime(entry.updated_at)}</span>
            </div>
          </li>
        ))}
      </ul>
    </DashboardWidgetShell>
  )
}
