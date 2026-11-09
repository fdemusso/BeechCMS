// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useRailLens } from "../hooks/use-rail-lens"
import { toRouterPath, usePrefetchRoute } from "../lib/route-prefetch"

import { NavSection } from "./nav-section"
import { NavNotifications } from "./nav-notifications"
import { NavUser } from "./nav-user"
import { SidebarSearch } from "./sidebar-search"
import { getStaticMenu, getContentCategoryMenu, getSettingsMenu, getStudioMenu, buildContentMenu } from "@/config/dashboard-menu"
import { logout } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useProfile, useSettingsDialog } from "@/features/settings"
import { useSchema, usePermissions } from "@/features/shared"
import type { MenuGates } from "@/config/dashboard-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

/**
 * Short line between groups; only shown in the icon rail, where the group labels are gone.
 * `spaced` adds extra room around it: used between the system blocks (Main / Content) and the seed-defined custom
 * groups, not between two custom groups.
 */
function RailDivider({ spaced = false }: { readonly spaced?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "mx-auto h-0 w-5 shrink-0 bg-sidebar-border opacity-0 transition-[opacity,height,margin] duration-(--duration-enter) group-data-[collapsible=icon]:h-px group-data-[collapsible=icon]:opacity-100",
        spaced && "group-data-[collapsible=icon]:my-2",
      )}
    />
  )
}

export const AppSidebar = React.memo(function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { user: storedUser } = useAuth()
  const { data: profile } = useProfile()
  const { data: seeds = [] } = useSchema()
  const { canGlobally, canAnywhere } = usePermissions()
  const { openSettings } = useSettingsDialog()
  const { state, isMobile } = useSidebar()
  const prefetchRoute = usePrefetchRoute()
  // The lens knows the icon the pointer is heading to before the click: warm its page then.
  const railLens = useRailLens(state === "collapsed" && !isMobile, (icon) => {
    const href = icon.closest("a")?.getAttribute("href")
    if (href) prefetchRoute(toRouterPath(href))
  })

  const gates: MenuGates = React.useMemo(() => ({
    viewAnalytics: canGlobally('view_analytics'),
    readContent: canAnywhere('content:read'),
    createContent: canAnywhere('content:create'),
    manageSeeds: canGlobally('manage_seeds'),
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
  const studioItems = getStudioMenu(t, gates)

  return (
    <Sidebar variant="inset" collapsible="icon" {...railLens} {...props}>
      {/* The profile card is vertically centred on the page title block (PageHeader). The page card's m-2 and this
          sidebar's p-2 are the same inset and cancel, so the header starts its content at
          --page-pad-top + (--page-title-h - --sb-profile-h) / 2 (all three in index.css). */}
      <SidebarHeader className="gap-3 pt-[calc(var(--page-pad-top)+(var(--page-title-h)-var(--sb-profile-h))/2)]">
        {/* The profile block replaced the logo + "Beech CMS / Dashboard" row; the logo is dropped on purpose. */}
        <NavUser user={user} onLogout={logout} />
        <SidebarSearch />
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:overflow-auto">
        <NavSection items={getStaticMenu(t, gates)} groupLabel={t("sidebar.navigation")}>
          <NavNotifications />
        </NavSection>
        {studioItems.length > 0 && (
          <>
            <RailDivider spaced />
            <NavSection items={studioItems} groupLabel={t("sidebar.studio")} />
          </>
        )}
        {contentCategoryItems.length > 0 && (
          <>
            <RailDivider spaced />
            <NavSection items={contentCategoryItems} groupLabel={t("sidebar.contentGroup")} />
          </>
        )}
        {contentGroups.map((group, i) => (
          <React.Fragment key={group.label}>
            <RailDivider spaced={i === 0} />
            <NavSection
              items={group.items}
              groupLabel={group.label}
              className={i === 0 ? "mt-4 group-data-[collapsible=icon]:mt-0" : undefined}
              hasLine
            />
          </React.Fragment>
        ))}
        {/* Settings entry with the sidebar close button beside it. */}
        {/* Collapsed (icon rail): the row stacks, settings icon above the toggle. */}
        <div data-rail-static className="mt-auto flex items-center pr-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-start group-data-[collapsible=icon]:pr-0">
          <NavSection items={getSettingsMenu(t).map((item) => ({ ...item, onSelect: () => openSettings() }))} className="min-w-0 flex-1 pt-0" />
          {/* Same box, radius, icon size, colour and hover as the Settings SidebarMenuButton beside it (size-8, rounded-control,
              16px icon), on the same centre line: self-start because the Settings group has pt-0, so centring in the row would
              sit 4px below the button. In the rail it stacks under it, left-aligned to the button (group p-2). */}
          <SidebarTrigger className="size-8 shrink-0 self-start rounded-control [&_svg]:size-4 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:ml-2 group-data-[collapsible=icon]:mb-2" />
        </div>
      </SidebarContent>
    </Sidebar>
  )
})
