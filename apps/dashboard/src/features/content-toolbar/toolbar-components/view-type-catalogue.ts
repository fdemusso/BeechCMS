// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType } from "react"
import type { DashboardView } from "@beechcms/core"
import type { ViewTypeId } from "@/features/shared"
import { Grid, Category, Kanban, ChartPie, Layout, List, Calendar, Map, Story, Feed, Edit, Element4 } from "reicon-react"

export interface ViewTypeCatalogueEntry {
  readonly type: ViewTypeId
  readonly labelKey: string
  readonly Icon: ComponentType<{ className?: string }>
}

/** Picker order: implemented types (AUTHORIZABLE_VIEWS order), then reserved ones. */
export const VIEW_TYPE_CATALOGUE: readonly ViewTypeCatalogueEntry[] = [
  { type: "table", labelKey: "content.list.table", Icon: Grid },
  { type: "gallery", labelKey: "content.list.gallery", Icon: Category },
  { type: "kanban", labelKey: "content.list.kanban", Icon: Kanban },
  { type: "chart", labelKey: "content.views.types.chart", Icon: ChartPie },
  { type: "board", labelKey: "content.views.types.board", Icon: Layout },
  { type: "list", labelKey: "content.views.types.list", Icon: List },
  { type: "calendar", labelKey: "content.views.types.calendar", Icon: Calendar },
  { type: "map", labelKey: "content.views.types.map", Icon: Map },
  { type: "timeline", labelKey: "content.views.types.timeline", Icon: Story },
  { type: "feed", labelKey: "content.views.types.feed", Icon: Feed },
  { type: "form", labelKey: "content.views.types.form", Icon: Edit },
  { type: "dashboard", labelKey: "content.views.types.dashboard", Icon: Element4 },
]

/** Icon of an implemented type, for the switcher tabs. DashboardView is a subset of the catalogue. */
export function viewTypeIcon(type: DashboardView): ComponentType<{ className?: string }> {
  return VIEW_TYPE_CATALOGUE.find((entry) => entry.type === type)?.Icon ?? Grid
}
