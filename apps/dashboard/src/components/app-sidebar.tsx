import * as React from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { getStaticMenu, CONTENT_MENU, STATIC_NAV_SECONDARY } from "@/config/dashboard-menu"
import { getStoredUser, logout } from "@/lib/api"
import { useProfile } from "@/features/settings"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const storedUser = getStoredUser()
  const { data: profile } = useProfile()
  const user = {
    name: profile?.name ?? storedUser?.name ?? "Admin",
    email: profile?.email ?? storedUser?.email ?? "",
    avatar: profile?.avatarUrl ?? undefined,
  }

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
                    src={resolvedTheme === "dark" ? "/beechLogoDark.svg" : "/BeechLogoLIght.svg"}
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
        <NavMain items={getStaticMenu(t)} groupLabel={t("sidebar.navigation")} />
        <NavMain items={CONTENT_MENU} groupLabel={t("sidebar.contents")} className="mt-4" />
        {STATIC_NAV_SECONDARY.length > 0 && (
          <NavSecondary items={STATIC_NAV_SECONDARY} className="mt-auto" />
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} onLogout={logout} />
      </SidebarFooter>
    </Sidebar>
  )
}
