import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { FileImage } from "lucide-react"
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
  if (status === "published") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
  if (status === "draft") return "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
  return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
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

export function RecentContentWidget({ seedSlug, variant = "list", onOpen }: RecentContentWidgetProps) {
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

  if (isLoading) return (
    <DashboardWidgetShell>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg animate-pulse" />
        ))}
      </div>
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (!data?.length) return (
    <DashboardWidgetShell>
      <WidgetEmpty icon={FileImage} title="Nessun contenuto" description="Crea il primo contenuto per vederlo qui" />
    </DashboardWidgetShell>
  )

  if (variant === "cards") {
    return (
      <DashboardWidgetShell>
        <div className="grid grid-cols-2 gap-3 h-full">
          {data.map((entry) => (
            <Card key={entry.id} className="cursor-pointer hover:shadow-md transition-shadow border-border/60 overflow-hidden">
              <Link to={`/content/${seedSlug}/${entry.id}`} className="block h-full">
                <div className="h-20 bg-muted flex items-center justify-center">
                  <FileImage className="size-7 text-muted-foreground/30" />
                </div>
                <CardContent className="p-2 space-y-1">
                  <p className="text-xs font-medium truncate">{entryTitle(entry)}</p>
                  <div className="flex items-center justify-between gap-1">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", statusVariant(entry.status))}>{entry.status}</span>
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
    <DashboardWidgetShell>
      <ul className="space-y-1">
        {data.map((entry) => (
          <li
            key={entry.id}
            className="group flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <Link
              to={`/content/${seedSlug}/${entry.id}`}
              className="text-sm font-medium truncate flex-1 hover:underline decoration-primary/30"
            >
              {entryTitle(entry)}
            </Link>
            <Badge className={cn("shrink-0 text-[10px]", statusVariant(entry.status))} variant="outline">{entry.status}</Badge>
            <span className="text-xs text-muted-foreground shrink-0">{relativeTime(entry.updated_at)}</span>
          </li>
        ))}
      </ul>
    </DashboardWidgetShell>
  )
}
