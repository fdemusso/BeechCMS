// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { DashboardColumn as DashboardColumnLayout } from "@beechcms/core"
import { DashboardWidgetHost } from "./dashboard-widget-host"

export interface DashboardColumnProps {
  column: DashboardColumnLayout
}

/** A column is a vertical stack of widgets, in array order. */
export function DashboardColumn({ column }: DashboardColumnProps) {
  return (
    <div className="flex flex-col gap-6">
      {column.widgets.map((widget) => (
        <DashboardWidgetHost key={widget.id} instance={widget} />
      ))}
    </div>
  )
}
