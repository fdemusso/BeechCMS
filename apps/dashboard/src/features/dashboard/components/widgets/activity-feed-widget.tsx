import { Activity } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardWidgetShell, useRecentActivity } from "@/features/dashboard"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

export interface ActivityFeedWidgetProps {
  seedSlug?: string
  variant?: "feed" | "compact"
  limit?: number
}

const ACTION_MAP: Record<string, string> = {
  create: "ha creato",
  update: "ha modificato",
  delete: "ha eliminato",
  upload: "ha caricato",
}

function initials(email?: string): string {
  if (!email) return "?"
  return email.slice(0, 2).toUpperCase()
}

function relativeTime(ts: number | null): string {
  if (!ts) return "—"
  return formatDistanceToNow(new Date(ts * 1000), { addSuffix: true, locale: it })
}

export function ActivityFeedWidget({ seedSlug, variant = "feed" }: ActivityFeedWidgetProps) {
  const { data, isLoading, isError, refetch } = useRecentActivity(seedSlug)

  if (isLoading) return (
    <DashboardWidgetShell>
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
    <DashboardWidgetShell>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (!data?.length) return (
    <DashboardWidgetShell>
      <WidgetEmpty icon={Activity} title="Nessun log di attività" />
    </DashboardWidgetShell>
  )

  if (variant === "compact") {
    const items = data.slice(0, 10)
    return (
      <DashboardWidgetShell>
        <ul className="space-y-1">
          {items.map((log) => (
            <li key={log.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground truncate flex-1">
                <span className="font-medium text-foreground">{log.user_email}</span>{" "}
                {ACTION_MAP[log.action] || log.action}{" "}
                <span className="font-medium text-foreground">
                  {log.details?.title || log.details?.name || log.entity_slug || log.entity_id}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">{relativeTime(log.created_at)}</span>
            </li>
          ))}
        </ul>
      </DashboardWidgetShell>
    )
  }

  return (
    <DashboardWidgetShell>
      <ScrollArea className="h-full max-h-[240px] pr-2">
        <ul className="space-y-3">
          {data.map((log) => (
            <li key={log.id} className="flex items-start gap-3">
              <Avatar className="size-8 shrink-0 border border-border/60">
                <AvatarFallback className="text-[10px] bg-primary/5 text-primary">
                  {initials(log.user_email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm leading-snug">
                  <span className="font-semibold">{log.user_email}</span>{" "}
                  <span className="text-muted-foreground">
                    {ACTION_MAP[log.action] || log.action}
                  </span>{" "}
                  <span className="font-medium">
                    {log.details?.title || log.details?.name || log.entity_slug || log.entity_id}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground/70">{relativeTime(log.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </DashboardWidgetShell>
  )
}
