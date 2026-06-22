// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"
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
  onCreateView?: () => void
  onRenameView?: (viewId: string, label: string) => void
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
  children?: React.ReactNode
}
