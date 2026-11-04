// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/lib/theme"

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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export const DashboardSidebar = React.memo(function DashboardSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
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
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="flex aspect-square size-10 items-center justify-center rounded-lg overflow-hidden">
                  <img
                    src={resolvedTheme === "dark" ? `${import.meta.env.BASE_URL}beechLogoDark.svg` : `${import.meta.env.BASE_URL}BeechLogoLIght.svg`}
                    alt="BeechCMS"
                    className="size-10 object-contain"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Beech CMS</span>
                  <span className="truncate text-xs">Dashboard</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
