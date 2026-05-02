import * as React from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { getStaticMenu, buildContentMenu, STATIC_NAV_SECONDARY } from "@/config/dashboard-menu"
import { logout } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useProfile } from "@/features/settings"
import { useSchema } from "@/features/schema/hooks/use-schema"
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
  const { user: storedUser } = useAuth()
  const { data: profile } = useProfile()
  const { data: seeds = [] } = useSchema()
  const user = {
    name: profile?.name ?? storedUser?.name ?? "Admin",
    email: profile?.email ?? storedUser?.email ?? "",
    avatar: profile?.avatarUrl ?? undefined,
  }

  const contentGroups = buildContentMenu(seeds, t("sidebar.contents"))

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
        <NavMain items={getStaticMenu(t)} groupLabel={t("sidebar.navigation")} />
        {contentGroups.map((group, i) => (
          <NavMain
            key={group.label}
            items={group.items}
            groupLabel={group.label}
            className={i === 0 ? "mt-4" : undefined}
          />
        ))}
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
