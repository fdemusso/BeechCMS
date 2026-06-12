// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { DashboardColumn as DashboardColumnLayout } from "@beechcms/core"
import { cn } from "@/lib/utils"
import { DashboardWidgetHost } from "./dashboard-widget-host"

export interface DashboardColumnProps {
  column: DashboardColumnLayout
}

/** A column is a vertical stack of widgets, in array order. A single-widget
 *  column stretches to the height of its grid row, so e.g. a Pie Chart next
 *  to a taller Area Chart fills the same vertical space. */
export function DashboardColumn({ column }: DashboardColumnProps) {
  const single = column.widgets.length === 1
  return (
    <div className={cn("flex flex-col gap-6", single && "h-full")}>
      {column.widgets.map((widget) => (
        <div key={widget.id} className={cn(single && "min-h-0 flex-1")}>
          <DashboardWidgetHost instance={widget} />
        </div>
      ))}
    </div>
  )
}
