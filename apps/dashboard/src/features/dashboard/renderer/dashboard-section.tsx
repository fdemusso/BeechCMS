// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import type { DashboardSection as DashboardSectionLayout } from "@beechcms/core"
import { cn } from "@/lib/utils"
import { DashboardColumn } from "./dashboard-column"

export interface DashboardSectionProps {
  section: DashboardSectionLayout
}

/** Spans on a 12-unit grid: explicit `columnSpans`, or an equal split with
 *  the remainder distributed left-to-right. */
function resolveColumnSpans(section: DashboardSectionLayout): number[] {
  const count = section.columns.length
  if (section.columnSpans && section.columnSpans.length === count) {
    return section.columnSpans
  }
  const base = Math.floor(12 / count)
  const remainder = 12 - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

export function DashboardSection({ section }: DashboardSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const spans = resolveColumnSpans(section)
  const showHeader = !section.hideLabel && (!!section.label || !!section.collapsible)

  return (
    <section className="flex flex-col gap-3">
      {showHeader && (
        <header className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span>{section.label}</span>
          {section.collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              className="rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className={cn("size-4 transition-transform", collapsed && "-rotate-90")} />
            </button>
          )}
        </header>
      )}
      {!collapsed && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-6 lg:grid-cols-12">
          {section.columns.map((column, i) => (
            <div
              key={column.id}
              className="bento-cell"
              style={
                {
                  "--col-span-md": Math.max(1, Math.ceil(spans[i] / 2)),
                  "--col-span-lg": spans[i],
                } as React.CSSProperties
              }
            >
              <DashboardColumn column={column} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
