import * as React from "react"
import { SidebarIcon } from "lucide-react"
import { useLocation, useSearchParams, Link } from "react-router-dom"
import { SEED_REGISTRY } from "@beech/core"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { NotificationsPopover } from "@/components/notifications-popover"
import { Separator } from "@/components/ui/separator"
import { useSidebar } from "@/components/ui/sidebar"

interface BreadcrumbSegment {
  label: string
  href?: string
}

const SETTINGS_TAB_LABELS: Record<string, string> = {
  profile: "Profilo",
  interface: "Interfaccia",
  security: "Sicurezza",
  storage: "Storage",
  notifications: "Notifiche",
}

function useBreadcrumbs(): BreadcrumbSegment[] {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()

  // /settings?tab=...
  if (pathname === "/settings") {
    const tab = searchParams.get("tab") ?? "profile"
    const tabLabel = SETTINGS_TAB_LABELS[tab] ?? tab
    return [
      { label: "Beech CMS", href: "/" },
      { label: "Impostazioni", href: "/settings" },
      { label: tabLabel },
    ]
  }

  // /content/:slug, /content/:slug/create, /content/:slug/:id
  const contentMatch = pathname.match(/^\/content\/([^/]+)(?:\/(.+))?$/)
  if (contentMatch) {
    const slug = contentMatch[1]
    const sub = contentMatch[2]
    const seed = Object.values(SEED_REGISTRY).find((s) => s.slug === slug)
    const seedLabel = seed?.labelPlural ?? seed?.label ?? slug

    const crumbs: BreadcrumbSegment[] = [
      { label: "Beech CMS", href: "/" },
      { label: "Contenuti", href: `/content/${slug}` },
      { label: seedLabel, href: sub ? `/content/${slug}` : undefined },
    ]

    if (sub === "create") {
      crumbs.push({ label: "Nuovo" })
    } else if (sub) {
      crumbs.push({ label: "Modifica" })
    }

    return crumbs
  }

  if (pathname === "/") {
    return [{ label: "Beech CMS", href: "/" }, { label: "Dashboard" }]
  }

  return [{ label: "Beech CMS", href: "/" }]
}

export function SiteHeader() {
  const { toggleSidebar } = useSidebar()
  const breadcrumbs = useBreadcrumbs()

  return (
    <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
        >
          <SidebarIcon />
        </Button>
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb className="hidden sm:block">
          <BreadcrumbList>
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1
              return (
                <React.Fragment key={i}>
                  <BreadcrumbItem>
                    {!isLast && crumb.href ? (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </React.Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <NotificationsPopover />
      </div>
    </header>
  )
}
