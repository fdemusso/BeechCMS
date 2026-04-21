import { Activity, Plus, Pencil, Trash2, Upload } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"
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
}

const ACTION_LABELS: Record<string, string> = {
  create: "ha creato",
  update: "ha modificato",
  delete: "ha eliminato",
  upload: "ha caricato",
}

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
    <DashboardWidgetShell title="Attività recente" icon={Activity}>
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
    <DashboardWidgetShell title="Attività recente" icon={Activity}>
      <WidgetError onRetry={() => refetch()} />
    </DashboardWidgetShell>
  )

  if (!data?.length) return (
    <DashboardWidgetShell title="Attività recente" icon={Activity}>
      <WidgetEmpty icon={Activity} title="Nessun log di attività" />
    </DashboardWidgetShell>
  )

  if (variant === "compact") {
    const items = data.slice(0, 10)
    return (
      <DashboardWidgetShell title="Attività recente" icon={Activity}>
        <ul className="space-y-1">
          {items.map((log) => (
            <li key={log.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground truncate flex-1">
                <span className="font-medium text-foreground">{log.user_email}</span>{" "}
                {ACTION_LABELS[log.action] || log.action}{" "}
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
    <DashboardWidgetShell title="Attività recente" icon={Activity}>
      <ScrollArea className="h-full pr-2">
        <ul className="space-y-3">
          {data.map((log) => {
            const ActionIcon = ACTION_ICONS[log.action] ?? Activity
            const actionColor = ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground"
            return (
              <li key={log.id} className="flex items-start gap-3 group">
                <div className="relative shrink-0">
                  <Avatar className="size-8 border border-border/60">
                    <AvatarFallback className="text-[10px] bg-primary/5 text-primary font-semibold">
                      {initials(log.user_email)}
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
                    <span className="font-semibold">{log.user_email}</span>{" "}
                    <span className="text-muted-foreground">
                      {ACTION_LABELS[log.action] || log.action}
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
