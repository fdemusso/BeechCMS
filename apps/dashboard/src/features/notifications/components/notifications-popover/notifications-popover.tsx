// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

"use client"

import { useCallback } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Bell, EyeOff, Trash2 } from '@/components/icons'

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
} from "@/components/ui/small-cta"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ButtonGroup } from "@/components/ui/button-group"
import { cn } from "@/lib/utils"

import { useNotificationsPopover } from "./use-notifications-popover"
import type { Notification, NotificationFilter } from "./types"

const FILTERS: ReadonlyArray<NotificationFilter> = ["all", "new"]

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
  const { t } = useTranslation()
  return (
    <div className="space-y-3 p-2">
      {notifications.length === 0 ? (
        // Scaled for the narrow popover; md:p-4 because Empty carries md:p-12.
        <Empty className="gap-0 border-0 p-4 md:p-4">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon" className="mb-1 size-9 bg-transparent">
              <Bell className="size-5" />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-medium">{t("notifications.noNotifications")}</EmptyTitle>
            <EmptyDescription className="text-xs/relaxed">
              {filter === "new"
                ? t("notifications.noNotificationsNew")
                : t("notifications.noNotificationsAll")}
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
  const { t } = useTranslation()
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
            "relative flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors text-left",
            "hover:bg-muted/50",
            notification.isNew
              ? "cursor-pointer"
              : "cursor-context-menu"
          )}
        >
          {notification.isNew && (
            <span
              className="absolute right-2 top-2 inline-block size-2 shrink-0 rounded-full bg-signal aspect-square"
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
        {notification.isNew ? (
          <ContextMenuItem onClick={() => onMarkSeen(notification.id)}>
            <Bell className="size-4" />
            {t("notifications.markSeen")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => onMarkUnseen(notification.id)}>
            <EyeOff className="size-4" />
            {t("notifications.markUnseen")}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(notification.id)}
        >
          <Trash2 className="size-4" />
          {t("notifications.delete")}
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

interface NotificationsPopoverProps {
  /** Replaces the default bell button; receives the unread state so a custom trigger can show it. */
  readonly renderTrigger?: (state: { hasUnread: boolean; unreadCount: number }) => ReactNode
  readonly side?: "top" | "right" | "bottom" | "left"
  readonly align?: "start" | "center" | "end"
}

/**
 * Componente principale per la gestione e visualizzazione delle notifiche.
 */
export function NotificationsPopover({ renderTrigger, side = "bottom", align = "end" }: NotificationsPopoverProps = {}) {
  const { t } = useTranslation()
  const {
    notifications,
    hasNotifications,
    filter,
    setFilter,
    hasUnreadNotifications,
    unreadCount,
    handleMarkSeen,
    handleMarkUnseen,
    handleDelete,
    handleMarkAllRead,
  } = useNotificationsPopover()

  const handleScrollClose = useCallback((event: React.UIEvent) => {
    const element = event.currentTarget as HTMLElement
    if (element) dispatchCloseContextMenu(element)
  }, [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        {renderTrigger ? (
          renderTrigger({ hasUnread: hasUnreadNotifications, unreadCount })
        ) : (
        <Button
          className="relative ml-auto h-8 w-8"
          variant="ghost"
          size="icon"
          aria-label={t("notifications.ariaLabel")}
        >
          <Bell className="size-4" />
          {hasUnreadNotifications && (
            <span
              className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-signal"
              aria-hidden
            />
          )}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {hasUnreadNotifications
              ? t("notifications.unreadCount", { count: unreadCount })
              : t("notifications.noUnread")}
          </span>
        </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={12}
        // Lifted off the page: opaque surface, system border colour and a deeper shadow than the default popover.
        // Narrower when there is nothing to list.
        className={cn(
          "p-0 shadow-xl ring-border",
          hasNotifications ? "w-80 sm:w-96" : "w-72",
        )}
      >
        <div className="flex items-center gap-3 border-b px-3 py-2.5">
          {/* Visible title dropped (the popover opens from the "Notifications" entry); kept for screen readers. */}
          <h3 className="sr-only">{t("notifications.title")}</h3>
          {/* Same outline buttons (system border + control radius) as the rest of the app, grouped as a segmented filter. */}
          <ButtonGroup className="flex-1">
            {FILTERS.map((value) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn("flex-1", filter === value && "bg-muted text-foreground")}
              >
                {t(`notifications.${value}`)}
              </Button>
            ))}
          </ButtonGroup>
          {hasUnreadNotifications && (
            <Button
              variant="link"
              size="sm"
              className="h-auto shrink-0 p-0 text-xs"
              onClick={() => handleMarkAllRead()}
            >
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>
        <div
          className="max-h-80 overflow-y-auto overflow-x-hidden"
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
