// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { DashboardView, Seed, TransferFormat } from "@beechcms/core"
import type { VisibilityState } from "@tanstack/react-table"
import type { DateGroupPrecision } from "@/lib/dynamic-columns"
import type { ConditionalFormatRule } from "@/lib/conditional-format"
import type { UserViewInstance, ToolbarFiltersState } from "./shared"
import type { TableDensity } from "@/lib/density"

export interface ContentToolbarProps {
  seed: Seed
  views: UserViewInstance[]
  activeViewId: string
  onChangeView: (viewId: string) => void
  onConditionalFormatsChange?: (
    viewId: string,
    next: ConditionalFormatRule[]
  ) => void
  /** Present only for users who may create views. */
  onCreateView?: (type: DashboardView) => void
  /** Types the "+" picker enables: the seed allow-list, empty without content:update. */
  creatableViewTypes?: readonly DashboardView[]
  /** Present only for users who may reorder views. */
  onReorderViews?: (orderedIds: string[]) => void
  onRenameView?: (viewId: string, label: string) => void
  /** Present only for users who may delete views. */
  onDeleteView?: (viewId: string) => void
  /** false when the active view is the content type's only Table instance. */
  canDeleteView?: boolean
  onCreate: () => void
  onOpenFilters?: () => void
  onOpenSort?: () => void
  onOpenAutomation?: () => void
  onOpenSettings?: () => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSubmitSearch?: (value: string) => void
  isFilterActive?: boolean
  isSortActive?: boolean
  isAutomationActive?: boolean
  isSettingsOpen?: boolean
  sortState?: {
    columnId: string | null
    desc: boolean
  }
  onSortChange?: (state: { columnId: string | null; desc: boolean }) => void
  filters?: ToolbarFiltersState
  onFiltersChange?: (state: ToolbarFiltersState) => void
  availableTagsByColumnId?: Record<string, string[]>
  availableStatusOptions?: string[]
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  columnVisibility?: VisibilityState
  onColumnVisibilityChange?: (visibility: VisibilityState) => void
  groupBy?: string | null
  onGroupByChange?: (columnId: string | null) => void
  dateGroupPrecision?: DateGroupPrecision
  onDateGroupPrecisionChange?: (precision: DateGroupPrecision) => void
  density?: TableDensity
  onDensityChange?: (density: TableDensity) => void
  /** The active View Type's own settings block; `close` closes the settings menu. */
  renderSettingsSection?: (ctx: { close: () => void }) => React.ReactNode
  /** Opens the card-layout dialog; shown in the settings menu when the View Type lists `cardLayout`. */
  onOpenCardConfig?: () => void
  /** Fires the export download. Optional: drafts-list.tsx renders this toolbar over a
   *  multi-seed list where a single-seed export has no meaning. */
  onExport?: (format: TransferFormat) => void
  /** Opens the import wizard. Optional, for the same reason. */
  onOpenImport?: () => void
  /** True while an export request is in flight, so the menu can show a spinner. */
  isExportPending?: boolean
  children?: React.ReactNode
}
