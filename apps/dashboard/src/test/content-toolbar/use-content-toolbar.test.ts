import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"

const mockUseToolbarSearch = vi.fn()
const mockUseToolbarMenusState = vi.fn()
const mockUseViewName = vi.fn()
const mockUseToolbarSort = vi.fn()
const mockUseToolbarGroupBy = vi.fn()
const mockUseToolbarFilters = vi.fn()
const mockUseConditionalFormats = vi.fn()

vi.mock("@/features/content-toolbar/toolbar-hooks/use-toolbar-search", () => ({
  useToolbarSearch: (...args: unknown[]) => mockUseToolbarSearch(...args),
}))
vi.mock("@/features/content-toolbar/toolbar-hooks/use-toolbar-menus-state", () => ({
  useToolbarMenusState: (...args: unknown[]) => mockUseToolbarMenusState(...args),
}))
vi.mock("@/features/content-toolbar/toolbar-hooks/use-view-name", () => ({
  useViewName: (...args: unknown[]) => mockUseViewName(...args),
}))
vi.mock("@/features/content-toolbar/toolbar-hooks/use-toolbar-sort", () => ({
  useToolbarSort: (...args: unknown[]) => mockUseToolbarSort(...args),
}))
vi.mock("@/features/content-toolbar/toolbar-hooks/use-toolbar-groupby", () => ({
  useToolbarGroupBy: (...args: unknown[]) => mockUseToolbarGroupBy(...args),
}))
vi.mock("@/features/content-toolbar/toolbar-hooks/use-toolbar-filters", () => ({
  useToolbarFilters: (...args: unknown[]) => mockUseToolbarFilters(...args),
}))
vi.mock("@/features/content-toolbar/toolbar-hooks/use-conditional-formats", () => ({
  useConditionalFormats: (...args: unknown[]) => mockUseConditionalFormats(...args),
}))

import { useContentToolbar } from "@/features/content-toolbar/use-content-toolbar"

const baseProps: any = {
  seed: { branches: [{ alias: "title", label: "Titolo", type: "text" }] },
  views: [{ id: "table", label: "Tabella", type: "table", enabledTools: ["filter", "sort"] }],
  activeViewId: "table",
  onCreate: vi.fn(),
}

function setupMocks() {
  mockUseToolbarSearch.mockReturnValue({
    isSearchOpen: false,
    searchInputRef: { current: null },
    handleSearchOpen: vi.fn(),
    handleSearchClose: vi.fn(),
    handleSearchSubmit: vi.fn(),
    handleSearchBlur: vi.fn(),
  })
  mockUseToolbarMenusState.mockReturnValue({
    sortColumnSearchTerm: "",
    setSortColumnSearchTerm: vi.fn(),
    filterColumnSearchTerm: "",
    setFilterColumnSearchTerm: vi.fn(),
    columnSearchTerm: "",
    setColumnSearchTerm: vi.fn(),
    filterMenuOpen: false,
    setFilterMenuOpen: vi.fn(),
    openPillId: null,
    setOpenPillId: vi.fn(),
    isSettingsMenuOpenState: false,
    setIsSettingsMenuOpenState: vi.fn(),
  })
  mockUseViewName.mockReturnValue({
    viewNameDraft: "Tabella",
    setViewNameDraft: vi.fn(),
    commitViewName: vi.fn(),
  })
  mockUseToolbarSort.mockReturnValue({
    filteredSortableColumns: [],
    handleToggleSortDirection: vi.fn(),
    handleSortColumnSelect: vi.fn(),
  })
  mockUseToolbarGroupBy.mockReturnValue({
    recommendedGroupColumns: [],
    otherGroupColumns: [],
    activeGroupLabel: null,
    datePrecisionMode: "monthYear",
    applyDatePrecisionMode: vi.fn(),
  })
  mockUseToolbarFilters.mockReturnValue({
    filterableColumns: [{ columnId: "title", label: "Titolo", type: "text", conditions: [] }],
    formattableColumns: [],
    addConditionToColumn: vi.fn(),
    removeColumnFilters: vi.fn(),
    updateCondition: vi.fn(),
    removeCondition: vi.fn(),
  })
  mockUseConditionalFormats.mockReturnValue({
    conditionalFormats: [],
    activeConditionalRule: null,
    isConditionalEditorOpen: false,
    setActiveConditionalRuleId: vi.fn(),
    setIsConditionalEditorOpen: vi.fn(),
    addConditionalFormatRule: vi.fn(),
    updateConditionalRule: vi.fn(),
    updateConditionalTextStyles: vi.fn(),
    removeConditionalRule: vi.fn(),
    moveConditionalRule: vi.fn(),
    updateConditionalCondition: vi.fn(),
    addConditionalCondition: vi.fn(),
    removeConditionalCondition: vi.fn(),
  })
}

describe("useContentToolbar", () => {
  it("calcola stati derivati e filtri visibili", () => {
    setupMocks()
    const { result } = renderHook(() =>
      useContentToolbar({
        ...baseProps,
        filters: {
          title: {
            columnId: "title",
            label: "Titolo",
            type: "text",
            conditions: [{ id: "c1", op: "contains", value: "abc" }],
          },
        },
      })
    )
    expect(result.current.activeView?.id).toBe("table")
    expect(result.current.isFilterActiveEffective).toBe(true)
    expect(result.current.isSortActiveEffective).toBe(false)
    expect(result.current.activeFiltersCountByColumn.title).toBe(1)
  })

  it("usa default enabled tools se activeView manca", () => {
    setupMocks()
    const { result } = renderHook(() =>
      useContentToolbar({
        ...baseProps,
        views: [],
      })
    )
    expect(result.current.enabledTools.length).toBeGreaterThan(0)
    expect(result.current.isToolEnabled("search")).toBe(true)
  })
})
