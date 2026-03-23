"use client"

import { useCallback } from "react"
import { Bell, EyeOff, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { useNotificationsPopover } from "./use-notifications-popover"
import type { Notification, NotificationFilter } from "./types"

const NOTIFICATION_SCROLL_HEIGHT = 320

interface NotificationListProps {
  readonly notifications: ReadonlyArray<Notification>
  readonly filter: NotificationFilter
  readonly onMarkSeen: (id: string) => void
  readonly onMarkUnseen: (id: string) => void
  readonly onDelete: (id: string) => void
}

interface NotificationCardProps {
  readonly notification: Notification
  readonly onMarkSeen: (id: string) => void
  readonly onMarkUnseen: (id: string) => void
  readonly onDelete: (id: string) => void
}

function NotificationList({
  notifications,
  filter,
  onMarkSeen,
  onMarkUnseen,
  onDelete,
}: NotificationListProps) {
  return (
    <div className="space-y-3 p-2">
      {notifications.length === 0 ? (
        <Empty className="border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Nessuna notifica</EmptyTitle>
            <EmptyDescription>
              {filter === "new"
                ? "Non hai nuove notifiche."
                : "Non ci sono notifiche da mostrare."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onMarkSeen={onMarkSeen}
            onMarkUnseen={onMarkUnseen}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  )
}

function NotificationCard({
  notification,
  onMarkSeen,
  onMarkUnseen,
  onDelete,
}: NotificationCardProps) {
  const Icon = notification.icon

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (notification.isNew) onMarkSeen(notification.id)
          }}
          className={cn(
            "relative flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
            "hover:bg-muted/50",
            notification.isNew
              ? "cursor-pointer"
              : "cursor-context-menu"
          )}
        >
          {notification.isNew && (
            <span
              className="absolute right-2 top-2 inline-block size-2 shrink-0 rounded-full bg-destructive aspect-square"
              aria-hidden
            />
          )}
          <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-full">
            <Icon className="text-muted-foreground size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{notification.title}</p>
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {notification.description}
            </p>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onMarkUnseen(notification.id)}>
          <EyeOff className="size-4" />
          Segna come non vista
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(notification.id)}
        >
          <Trash2 className="size-4" />
          Elimina
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function dispatchCloseContextMenu(container: HTMLElement) {
  const event = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    view: globalThis as unknown as Window,
    clientX: 0,
    clientY: 0,
  })
  container.dispatchEvent(event)
}

/**
 * Componente principale per la gestione e visualizzazione delle notifiche.
 */
export function NotificationsPopover() {
  const {
    notifications,
    filter,
    setFilter,
    hasUnreadNotifications,
    unreadCount,
    handleMarkSeen,
    handleMarkUnseen,
    handleDelete,
  } = useNotificationsPopover()

  const handleScrollClose = useCallback((event: React.UIEvent) => {
    const element = event.currentTarget as HTMLElement
    if (element) dispatchCloseContextMenu(element)
  }, [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="relative ml-auto h-8 w-8"
          variant="ghost"
          size="icon"
          aria-label="Notifiche"
        >
          <Bell className="size-4" />
          {hasUnreadNotifications && (
            <span
              className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-destructive"
              aria-hidden
            />
          )}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {hasUnreadNotifications
              ? `Hai ${unreadCount} notifiche non lette`
              : "Nessuna notifica non letta"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 p-0 sm:w-96"
      >
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Notifiche</h3>
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) =>
              value && setFilter(value as NotificationFilter)
            }
            variant="outline"
            className="mt-2 w-full justify-start"
          >
            <ToggleGroupItem value="all" className="flex-1">
              Tutte
            </ToggleGroupItem>
            <ToggleGroupItem value="new" className="flex-1">
              Nuove
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div
          style={{ height: NOTIFICATION_SCROLL_HEIGHT }}
          className="overflow-y-auto overflow-x-hidden"
          onScroll={handleScrollClose}
          onWheel={handleScrollClose}
        >
          <NotificationList
            notifications={notifications}
            filter={filter}
            onMarkSeen={handleMarkSeen}
            onMarkUnseen={handleMarkUnseen}
            onDelete={handleDelete}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
