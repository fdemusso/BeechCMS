import type { Seed } from "@beechcms/core"
import type { VisibilityState } from "@tanstack/react-table"
import type { DateGroupPrecision } from "@/lib/dynamic-columns"
import type { ConditionalFormatRule } from "@/lib/conditional-format"
import type { UserViewInstance, ToolbarFiltersState } from "./shared"

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
  children?: React.ReactNode
}
