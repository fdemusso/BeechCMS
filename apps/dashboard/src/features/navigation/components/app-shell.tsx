// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { CSSProperties, ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { SiteHeader } from "./site-header"

// TODO(sidebar-redesign): flip back (or delete with SiteHeader) once toggle/notifications are re-homed.
const SHOW_SITE_HEADER = false

/** Opens the sidebar sheet on mobile; on desktop the sidebar collapses to an icon rail that keeps its own toggle. */
function SidebarReopenTrigger() {
  const { isMobile } = useSidebar()
  if (!isMobile) return null
  return <SidebarTrigger className="fixed left-4 top-4 z-20 bg-background/80 backdrop-blur" />
}

interface AppShellProps {
  readonly children?: ReactNode
}

/**
 * Page shell shared by every page: inset sidebar on the page floor + the page body as a rounded card that scrolls
 * internally via ScrollArea ("body-dashboard"). Pages render only their content inside it.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    // --header-height is 0 while SiteHeader is hidden: sticky bars inside the body (top-(--header-height)) stick to the
    // top of the ScrollArea viewport.
    <div className="relative [--header-height:0px]">
      {/* Wider than the 16rem default; the style prop is merged after the defaults. */}
      <SidebarProvider className="h-svh overflow-hidden" style={{ "--sidebar-width": "18rem" } as CSSProperties}>
        {/* TODO(sidebar-redesign): SiteHeader is hidden, not deleted. Its jobs still need a new home:
            sidebar toggle (also the only way to open the sidebar on mobile), NotificationsPopover,
            breadcrumbs. */}
        {SHOW_SITE_HEADER && <SiteHeader />}
        <AppSidebar />
        <SidebarReopenTrigger />
        {/* md:m-2 on the inset variant eats 1rem of height. */}
        {/* TODO(sidebar-redesign): card border/contrast is still the default `shadow-sm`; tune the edge. */}
        <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)] md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
          <ScrollArea className="h-full">{children}</ScrollArea>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
