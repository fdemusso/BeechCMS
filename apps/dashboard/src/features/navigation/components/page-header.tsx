// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  /** Right-hand side (buttons); drops under the title on narrow screens. */
  readonly actions?: ReactNode
  readonly className?: string
}

/**
 * Title block shared by every page: the size of the dashboard greeting. The h1 is pinned to a 36px line (leading-9) so
 * the block is 36 + 6 + 24 = 66px tall (--page-title-h) when it has a description. The sidebar
 * profile card is centred on that block (see index.css and AppSidebar), which is why every page starts it at the same
 * height.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-semibold leading-9 tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
