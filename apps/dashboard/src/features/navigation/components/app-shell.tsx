// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { CSSProperties, ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"

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
    <div className="relative">
      {/* Wider than the 16rem default; the style prop is merged after the defaults. */}
      <SidebarProvider className="h-svh overflow-hidden" style={{ "--sidebar-width": "18rem" } as CSSProperties}>
        <AppSidebar />
        <SidebarReopenTrigger />
        {/* md:m-2 on the inset variant eats 1rem of height. The card edge is the inset variant's own rounded-lg + shadow-sm. */}
        <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-1rem)] md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0">
          <ScrollArea className="h-full">{children}</ScrollArea>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
