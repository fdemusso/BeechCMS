// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Bell } from "@/components/icons"
import { NotificationsPopover } from "@/features/notifications"
import { SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

/** Sidebar entry that opens the notifications popover beside the sidebar; shows the unread count as a badge. */
export function NavNotifications() {
  const { t } = useTranslation()

  return (
    <SidebarMenuItem>
      <NotificationsPopover
        side="right"
        align="start"
        renderTrigger={({ hasUnread, unreadCount }) => (
          <SidebarMenuButton tooltip={t("notifications.title")} className="relative">
            <Bell />
            <span>{t("notifications.title")}</span>
            {/* The badge is built to sit beside the button; here it lives inside the popover trigger, so it flows
                in the row instead of being absolutely positioned. */}
            {/* The rail has no room for the count (the badge is hidden there): show a dot on the icon instead. */}
            {hasUnread && (
              <span aria-hidden className="absolute right-1.5 top-1.5 hidden size-2 rounded-full bg-signal group-data-[collapsible=icon]:block" />
            )}
            {hasUnread && (
              <SidebarMenuBadge className="static ml-auto h-5 rounded-full bg-signal px-1.5 text-signal-on peer-hover/menu-button:text-signal-on">
                {unreadCount > 99 ? "99+" : unreadCount}
              </SidebarMenuBadge>
            )}
          </SidebarMenuButton>
        )}
      />
    </SidebarMenuItem>
  )
}
