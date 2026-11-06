// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { resolveIcon } from "@/lib/icon-registry"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SidebarPreview as SidebarPreviewData } from "../lib/sidebar-preview"

export interface SidebarPreviewProps extends SidebarPreviewData {
  groupLabel: string
  /** The content type is hidden from the sidebar: it is listed for what it would be, not as an entry. */
  hidden: boolean
}

/** The sidebar group the content type lands in, with its neighbours: shows what "group" and "order" do. */
export function SidebarPreview({ groupLabel, items, before, after, hidden }: SidebarPreviewProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-medium text-muted-foreground">{t("seedBuilder.editor.dashPreview")}</p>
      <div className="space-y-1">
        <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{groupLabel}</p>
        <ul className="space-y-0.5">
          {before > 0 && <More count={before} />}
          {items.map((item) => {
            const Icon = resolveIcon(item.icon)
            const hiddenSelf = hidden && item.current
            const row = (
              <li
                aria-current={item.current}
                className={cn(
                  "flex items-center gap-2 rounded-control px-2 py-1.5 text-sm",
                  item.current ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground",
                  hiddenSelf && "line-through opacity-50"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="font-mono text-xs tabular-nums opacity-70">{item.order}</span>
              </li>
            )
            // As in the sidebar, the description shows up when hovering the entry.
            return item.description ? (
              <Tooltip key={item.slug ?? "current"}>
                <TooltipTrigger asChild>{row}</TooltipTrigger>
                <TooltipContent side="right">{item.description}</TooltipContent>
              </Tooltip>
            ) : (
              <React.Fragment key={item.slug ?? "current"}>{row}</React.Fragment>
            )
          })}
          {after > 0 && <More count={after} />}
        </ul>
      </div>
      {hidden && <p className="text-xs text-muted-foreground">{t("seedBuilder.editor.dashPreviewHidden")}</p>}
    </div>
  )
}

/** Stands for the entries of the group that are left out of the preview. */
function More({ count }: { count: number }) {
  const { t } = useTranslation()
  return (
    <li className="px-2 py-0.5 text-xs text-muted-foreground" aria-hidden>
      {t("seedBuilder.editor.dashPreviewMore", { count })}
    </li>
  )
}
