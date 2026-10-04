// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { SiteHeader } from "./site-header"

interface PageShellLoadingProps {
  readonly message: string
}

/** Full page shell (header + sidebar) around a centered loading message, for a page's own loading state. */
export function PageShellLoading({ message }: PageShellLoadingProps) {
  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="flex flex-1 items-center justify-center py-12">
              <div className="text-muted-foreground">{message}</div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
