import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { Clock, FileImage } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"
import { Link } from "react-router-dom"

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

function relativeTime(ts: number | null): string {
  if (!ts) return "—"
  return formatDistanceToNow(new Date(ts * 1000), { addSuffix: true, locale: it })
}

interface ContentListResponse {
  items: ContentEntry[]
  total: number
}

export function RecentContentWidget({ seedSlug, variant = "list" }: RecentContentWidgetProps) {
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
      Vedi tutti →
    </Link>
  )

  if (isLoading) return (
    <DashboardWidgetShell title="Contenuti recenti" icon={Clock} action={viewAllAction}>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg animate-pulse" />
        ))}
      </div>
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell title="Contenuti recenti" icon={Clock} action={viewAllAction}>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (!data?.length) return (
    <DashboardWidgetShell title="Contenuti recenti" icon={Clock}>
      <WidgetEmpty icon={FileImage} title="Nessun contenuto" description="Crea il primo contenuto per vederlo qui" />
    </DashboardWidgetShell>
  )

  if (variant === "cards") {
    return (
      <DashboardWidgetShell title="Contenuti recenti" icon={Clock} action={viewAllAction}>
        <div className="grid grid-cols-2 gap-3">
          {data.map((entry) => (
            <Card key={entry.id} className="cursor-pointer hover:shadow-md transition-shadow border-border/60 overflow-hidden">
              <Link to={`/content/${seedSlug}/${entry.id}`} className="block">
                <div className="h-20 bg-muted flex items-center justify-center">
                  <FileImage className="size-7 text-muted-foreground/30" />
                </div>
                <CardContent className="p-2 space-y-1">
                  <p className="text-xs font-medium truncate">{entryTitle(entry)}</p>
                  <div className="flex items-center justify-between gap-1">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold border", statusVariant(entry.status))}>{entry.status}</span>
                    <span className="text-[10px] text-muted-foreground">{relativeTime(entry.updated_at)}</span>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell title="Contenuti recenti" icon={Clock} action={viewAllAction}>
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
