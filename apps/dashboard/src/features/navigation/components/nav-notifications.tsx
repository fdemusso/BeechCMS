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
          <SidebarMenuButton tooltip={t("notifications.title")}>
            <Bell />
            <span>{t("notifications.title")}</span>
            {hasUnread && <SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>}
          </SidebarMenuButton>
        )}
      />
    </SidebarMenuItem>
  )
}
