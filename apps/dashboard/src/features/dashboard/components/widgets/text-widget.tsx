// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { cn } from "@/lib/utils"
import { DashboardWidgetShell } from "../dashboard-widget-shell"

export interface TextWidgetConfig {
  content: string
  align?: "left" | "center"
}

/** Plain-text note widget. No HTML/TipTap rendering — text only. */
export function TextWidget({ config }: { config: TextWidgetConfig }) {
  const align = config.align ?? "left"

  return (
    <DashboardWidgetShell bare>
      <div
        className={cn(
          "h-full w-full overflow-auto whitespace-pre-wrap text-sm text-muted-foreground p-5",
          align === "center" && "text-center",
        )}
      >
        {config.content}
      </div>
    </DashboardWidgetShell>
  )
}
