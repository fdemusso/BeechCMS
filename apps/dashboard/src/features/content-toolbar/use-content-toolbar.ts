import { useMemo } from "react"
import { useToolbarSearch } from "./toolbar-hooks/use-toolbar-search"
import { useToolbarMenusState } from "./toolbar-hooks/use-toolbar-menus-state"
import { useViewName } from "./toolbar-hooks/use-view-name"
import { useToolbarSort } from "./toolbar-hooks/use-toolbar-sort"
import { useToolbarGroupBy } from "./toolbar-hooks/use-toolbar-groupby"
import { useToolbarFilters } from "./toolbar-hooks/use-toolbar-filters"
import { useConditionalFormats } from "./toolbar-hooks/use-conditional-formats"
import { DEFAULT_ENABLED_TOOLS } from "./shared"

import type { ContentToolbarProps } from "./types"

export function useContentToolbar({
  seed,
  views,
  activeViewId,
  onRenameView,
  isFilterActive,
  isSortActive,
  isAutomationActive,
  isSettingsOpen,
  searchValue = "",
  onSearchChange,
  onSubmitSearch,
  sortState,
  onSortChange,
  filters = {},
  onFiltersChange,
  availableStatusOptions = [],
  groupBy = null,
  dateGroupPrecision = { year: true, month: true, day: false },
  onDateGroupPrecisionChange,
  onConditionalFormatsChange,
}: ContentToolbarProps) {
  const activeView = views.find((v: any) => v.id === activeViewId)

  const {
    isSearchOpen,
    searchInputRef,
    handleSearchOpen,
    handleSearchClose,
    handleSearchSubmit,
    handleSearchBlur,
  } = useToolbarSearch({ searchValue, onSearchChange, onSubmitSearch })

  const {
    sortColumnSearchTerm,
    setSortColumnSearchTerm,
    filterColumnSearchTerm,
    setFilterColumnSearchTerm,
    columnSearchTerm,
    setColumnSearchTerm,
    filterMenuOpen,
    setFilterMenuOpen,
    openPillId,
    setOpenPillId,
    isSettingsMenuOpenState,
    setIsSettingsMenuOpenState,
  } = useToolbarMenusState()

  const { viewNameDraft, setViewNameDraft, commitViewName } = useViewName({
    activeView,
    onRenameView,
  })

  const enabledTools = useMemo(
    () => activeView?.enabledTools ?? DEFAULT_ENABLED_TOOLS,
    [activeView]
  )

  const isFilterActiveEffective =
    isFilterActive ?? Object.values(filters).some((group: any) => group.conditions.length > 0)
  const isSortActiveEffective = isSortActive ?? Boolean(sortState?.columnId)
  const isAutomationActiveEffective = isAutomationActive ?? false
  const isSettingsMenuOpenEffective = isSettingsOpen ?? isSettingsMenuOpenState

  const closeSettingsMenu = () => {
    if (isSettingsOpen === undefined) setIsSettingsMenuOpenState(false)
  }

  const isToolEnabled = (tool: string) => enabledTools.includes(tool as any)

  const sortTools = useToolbarSort({
    seed,
    sortColumnSearchTerm,
    sortState,
    onSortChange,
  })

  const {
    filterableColumns,
    formattableColumns,
    addConditionToColumn,
    removeColumnFilters,
    updateCondition,
    removeCondition,
  } = useToolbarFilters({
    seed,
    filters,
    onFiltersChange,
    availableStatusOptions,
  })

  const conditionalFormatsTools = useConditionalFormats({
    viewId: activeView?.id,
    conditionalFormatsInput: activeView?.conditionalFormats,
    formattableColumns,
    onConditionalFormatsChange,
  })

  const tableColumns = useMemo(
    () =>
      [
        { id: "slug", label: "Slug" },
        { id: "status", label: "Stato" },
        ...seed.branches.map((branch: any) => ({
          id: branch.alias,
          label: branch.label,
        })),
      ] as Array<{ id: string; label: string }>,
    [seed.branches]
  )

  const visibleFilterColumns = useMemo(() => {
    const term = filterColumnSearchTerm.trim().toLowerCase()
    if (!term) return filterableColumns
    return filterableColumns.filter((c: any) => c.label.toLowerCase().includes(term))
  }, [filterColumnSearchTerm, filterableColumns])

  const activeFiltersCountByColumn = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters).map(([columnId, group]: [string, any]) => [columnId, group.conditions.length])
      ),
    [filters]
  )

  const filteredTableColumns = useMemo(() => {
    const term = columnSearchTerm.trim().toLowerCase()
    if (!term) return tableColumns
    return tableColumns.filter((c) => c.label.toLowerCase().includes(term))
  }, [columnSearchTerm, tableColumns])

  const groupByTools = useToolbarGroupBy({
    seed,
    availableStatusOptions,
    groupBy,
    dateGroupPrecision,
    onDateGroupPrecisionChange,
  })

  return {
    activeView,
    enabledTools,
    isFilterActiveEffective,
    isSortActiveEffective,
    isAutomationActiveEffective,
    isSettingsMenuOpenEffective,
    closeSettingsMenu,
    isToolEnabled,

    // Search
    isSearchOpen,
    searchInputRef,
    handleSearchOpen,
    handleSearchClose,
    handleSearchSubmit,
    handleSearchBlur,

    // Menus State
    sortColumnSearchTerm,
    setSortColumnSearchTerm,
    filterColumnSearchTerm,
    setFilterColumnSearchTerm,
    columnSearchTerm,
    setColumnSearchTerm,
    filterMenuOpen,
    setFilterMenuOpen,
    openPillId,
    setOpenPillId,
    isSettingsMenuOpenState,
    setIsSettingsMenuOpenState,

    // View Name
    viewNameDraft,
    setViewNameDraft,
    commitViewName,

    // Sort
    ...sortTools,

    // Filters
    filterableColumns,
    formattableColumns,
    addConditionToColumn,
    removeColumnFilters,
    updateCondition,
    removeCondition,
    visibleFilterColumns,
    activeFiltersCountByColumn,

    // Conditional formats
    ...conditionalFormatsTools,

    // Columns
    tableColumns,
    filteredTableColumns,

    // Group By
    ...groupByTools,
  }
}
