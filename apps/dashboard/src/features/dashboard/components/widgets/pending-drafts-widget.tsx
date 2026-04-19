import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { ClipboardList } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell } from "@/features/dashboard"
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

function entryTitle(entry: ContentEntry): string {
  for (const val of Object.values(entry.data)) {
    if (typeof val === "string" && val.trim()) return val
  }
  return entry.id
}

export function PendingDraftsWidget({ seedSlug, variant = "list", onPublish, onOpen }: PendingDraftsWidgetProps) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["widget", "pending-drafts", seedSlug],
    queryFn: async (): Promise<ContentEntry[]> => {
      const res = await api.get<ContentListResponse | ContentEntry[]>(`/content/${seedSlug}`, {
        params: { status: "draft", limit: 10 },
      })
      const d = res.data
      return Array.isArray(d) ? d : d.items
    },
    staleTime: 3 * 60 * 1000,
  })

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/content/${seedSlug}/${id}`, { status: "published" })
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget", "pending-drafts", seedSlug] })
      queryClient.invalidateQueries({ queryKey: ["widget", "recent-content", seedSlug] })
    },
  })

  if (isLoading) return (
    <DashboardWidgetShell>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full animate-pulse" />)}
      </div>
    </DashboardWidgetShell>
  )

  if (isError) return (
    <DashboardWidgetShell>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (variant === "counter") {
    return (
      <DashboardWidgetShell>
        <div className="flex flex-col items-center justify-center gap-2 h-full text-center">
          <span className="text-5xl font-bold tabular-nums">{data?.length ?? 0}</span>
          <p className="text-sm text-muted-foreground">bozze in attesa</p>
          <Button variant="outline" size="sm" onClick={() => onOpen?.(undefined)}>Vedi tutte</Button>
        </div>
      </DashboardWidgetShell>
    )
  }

  if (!data?.length) return (
    <DashboardWidgetShell>
      <WidgetEmpty icon={ClipboardList} title="Nessuna bozza in attesa" />
    </DashboardWidgetShell>
  )

  return (
    <DashboardWidgetShell>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bozze in attesa</p>
        <span className="text-xs text-muted-foreground">{data.length} totali</span>
      </div>
      <ScrollArea className="max-h-[200px]">
        <ul className="space-y-1 pr-2">
          {data.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors">
              <Link
                to={`/content/${seedSlug}/${entry.id}`}
                className="flex-1 text-sm font-medium truncate hover:underline text-foreground decoration-primary/30"
              >
                {entryTitle(entry)}
              </Link>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {entry.updated_at ? formatDistanceToNow(new Date(entry.updated_at * 1000), { addSuffix: true, locale: it }) : "—"}
              </span>
              <Button
                size="sm"
                variant="default"
                className="h-6 text-xs px-2 shrink-0"
                disabled={publishMutation.isPending}
                onClick={() => {
                  publishMutation.mutate(entry.id)
                  onPublish?.(entry.id)
                }}
              >
                Pubblica
              </Button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </DashboardWidgetShell>
  )
}
