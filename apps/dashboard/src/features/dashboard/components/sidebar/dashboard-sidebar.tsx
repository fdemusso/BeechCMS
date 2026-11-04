// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"

import { DashboardNavMain } from "./dashboard-nav-main"
import { DashboardNavSecondary } from "./dashboard-nav-secondary"
import { DashboardNavUser } from "./dashboard-nav-user"
import { getStaticMenu, getContentCategoryMenu, getSettingsMenu, buildContentMenu, STATIC_NAV_SECONDARY } from "@/config/dashboard-menu"
import { logout } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useProfile } from "@/features/settings"
import { useSchema, usePermissions } from "@/features/shared"
import type { MenuGates } from "@/config/dashboard-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

export const DashboardSidebar = React.memo(function DashboardSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { user: storedUser } = useAuth()
  const { data: profile } = useProfile()
  const { data: seeds = [] } = useSchema()
  const { canGlobally, canAnywhere } = usePermissions()

  const gates: MenuGates = React.useMemo(() => ({
    viewAnalytics: canGlobally('view_analytics'),
    readContent: canAnywhere('content:read'),
    createContent: canAnywhere('content:create'),
  }), [canGlobally, canAnywhere])

  const fullName = profile
    ? [profile.name, profile.surname].filter(Boolean).join(' ')
    : storedUser
    ? [storedUser.name, storedUser.surname].filter(Boolean).join(' ')
    : "Admin"

  const user = {
    name: fullName || "Admin",
    email: profile?.email ?? storedUser?.email ?? "",
    avatar: profile?.avatarUrl ?? undefined,
  }

  const contentGroups = buildContentMenu(seeds, t("sidebar.contents"))
  const contentCategoryItems = getContentCategoryMenu(t, gates)

  return (
    <Sidebar variant="inset" {...props}>
      {/* Logo row is vertically centred on the dashboard greeting block (title + subtitle, see dashboard-page.tsx):
          greeting centre = 8 (card m-2) + 14 (main pt-3.5) + 66/2 = 55px, logo button is h-12 so its top sits at 31px,
          i.e. 8 (inset p-2) + 23 (pt). Keep both files in sync. */}
      <SidebarHeader className="pt-[23px]">
        {/* TODO(sidebar-redesign): the profile block now lives here (was the logo + "Beech CMS / Dashboard").
            The logo needs a new home, and the footer DashboardNavUser below is now a duplicate to remove. */}
        <DashboardNavUser user={user} onLogout={logout} layout="header" />
      </SidebarHeader>
      <SidebarContent>
        <DashboardNavMain items={getStaticMenu(t, gates)} groupLabel={t("sidebar.navigation")} />
        {contentCategoryItems.length > 0 && (
          <DashboardNavMain items={contentCategoryItems} groupLabel={t("sidebar.contentGroup")} />
        )}
        {contentGroups.map((group, i) => (
          <DashboardNavMain
            key={group.label}
            items={group.items}
            groupLabel={group.label}
            className={i === 0 ? "mt-4" : undefined}
            hasLine
          />
        ))}
        {STATIC_NAV_SECONDARY.length > 0 && (
          <DashboardNavSecondary items={STATIC_NAV_SECONDARY} />
        )}
        <DashboardNavMain items={getSettingsMenu(t)} className="mt-auto pt-0" />
      </SidebarContent>
      <SidebarFooter>
        <DashboardNavUser user={user} onLogout={logout} />
      </SidebarFooter>
    </Sidebar>
  )
})
