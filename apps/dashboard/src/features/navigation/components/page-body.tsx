// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ReactNode, Ref } from "react"
import { cn } from "@/lib/utils"

interface PageBodyProps {
  readonly children: ReactNode
  /** Classes for the width-limited content column inside the padded body. */
  readonly innerClassName?: string
  readonly innerRef?: Ref<HTMLDivElement>
}

/**
 * Padding and content column shared by every page, inside AppShell. The top padding is smaller than the sides
 * (md:pt-3.5) so the page title lines up with the sidebar profile card (see PageHeader / AppSidebar).
 * `content-area-inner` caps the width at 2200px for a good read on 16:9 and 21:9 alike.
 */
export function PageBody({ children, innerClassName, innerRef }: PageBodyProps) {
  return (
    // A div, not <main>: SidebarInset already is the page's main landmark.
    <div className="flex min-w-0 flex-1 flex-col p-6 md:pt-3.5 lg:p-8 lg:pt-3.5">
      <div ref={innerRef} className={cn("content-area-inner", innerClassName)}>
        {children}
      </div>
    </div>
  )
}
