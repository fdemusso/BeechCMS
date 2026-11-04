// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"

import { NavMain } from "./nav-main"
import { NavSecondary } from "./nav-secondary"
import { NavUser } from "./nav-user"
import { SidebarSearch } from "./sidebar-search"
import { getStaticMenu, getContentCategoryMenu, getSettingsMenu, buildContentMenu, STATIC_NAV_SECONDARY } from "@/config/dashboard-menu"
import { logout } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useProfile, useSettingsDialog } from "@/features/settings"
import { useSchema, usePermissions } from "@/features/shared"
import type { MenuGates } from "@/config/dashboard-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar"

export const AppSidebar = React.memo(function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { user: storedUser } = useAuth()
  const { data: profile } = useProfile()
  const { data: seeds = [] } = useSchema()
  const { canGlobally, canAnywhere } = usePermissions()
  const { openSettings } = useSettingsDialog()

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
            The logo needs a new home. */}
        <NavUser user={user} onLogout={logout} />
        <SidebarSearch />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={getStaticMenu(t, gates)} groupLabel={t("sidebar.navigation")} />
        {contentCategoryItems.length > 0 && (
          <NavMain items={contentCategoryItems} groupLabel={t("sidebar.contentGroup")} />
        )}
        {contentGroups.map((group, i) => (
          <NavMain
            key={group.label}
            items={group.items}
            groupLabel={group.label}
            className={i === 0 ? "mt-4" : undefined}
            hasLine
          />
        ))}
        {STATIC_NAV_SECONDARY.length > 0 && (
          <NavSecondary items={STATIC_NAV_SECONDARY} />
        )}
        <NavMain items={getSettingsMenu(t).map((item) => ({ ...item, onSelect: () => openSettings() }))} className="mt-auto pt-0" />
      </SidebarContent>
    </Sidebar>
  )
})
