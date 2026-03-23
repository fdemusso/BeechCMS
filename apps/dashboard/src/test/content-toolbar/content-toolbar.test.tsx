import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"

const mockUseContentToolbar = vi.fn()

vi.mock("@/components/content-toolbar/use-content-toolbar", () => ({
  useContentToolbar: (...args: unknown[]) => mockUseContentToolbar(...args),
}))

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("@/components/content-toolbar/toolbar-components/view-switcher", () => ({
  ViewSwitcher: ({ onChangeView }: any) => <button onClick={() => onChangeView("table")}>view</button>,
}))
vi.mock("@/components/content-toolbar/toolbar-components/filter-column-menu", () => ({
  FilterColumnMenu: ({ onSelectColumn }: any) => (
    <button onClick={() => onSelectColumn("title")}>filter-menu</button>
  ),
}))
vi.mock("@/components/content-toolbar/toolbar-components/sort-column-menu", () => ({
  SortColumnMenu: ({ onSelectColumn }: any) => (
    <button onClick={() => onSelectColumn("title")}>sort-menu</button>
  ),
}))
vi.mock("@/components/content-toolbar/toolbar-components/search-bar", () => ({
  SearchBar: () => <div>SEARCH_BAR</div>,
}))
vi.mock("@/components/content-toolbar/toolbar-components/settings-menu", () => ({
  SettingsMenu: () => <div>SETTINGS_MENU</div>,
}))
vi.mock("@/components/content-toolbar/toolbar-components/filter-pills-bar", () => ({
  FilterPillsBar: () => <div>FILTER_PILLS</div>,
}))

import { ContentToolbar } from "@/components/content-toolbar/content-toolbar"

describe("ContentToolbar", () => {
  it("renderizza strumenti e crea nuova entry", () => {
    const onCreate = vi.fn()
    mockUseContentToolbar.mockReturnValue({
      activeView: { id: "table" },
      enabledTools: ["filter", "sort", "search", "settings", "create", "automation"],
      isFilterActiveEffective: false,
      isSortActiveEffective: false,
      isAutomationActiveEffective: false,
      isSettingsMenuOpenEffective: false,
      closeSettingsMenu: vi.fn(),
      isToolEnabled: () => true,
      isSearchOpen: false,
      searchInputRef: { current: null },
      handleSearchOpen: vi.fn(),
      handleSearchClose: vi.fn(),
      handleSearchSubmit: vi.fn(),
      handleSearchBlur: vi.fn(),
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
      setIsSettingsMenuOpenState: vi.fn(),
      viewNameDraft: "Tabella",
      setViewNameDraft: vi.fn(),
      commitViewName: vi.fn(),
      filteredSortableColumns: [],
      handleToggleSortDirection: vi.fn(),
      handleSortColumnSelect: vi.fn(),
      addConditionToColumn: vi.fn(),
      removeColumnFilters: vi.fn(),
      updateCondition: vi.fn(),
      removeCondition: vi.fn(),
      visibleFilterColumns: [],
      activeFiltersCountByColumn: {},
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
      filteredTableColumns: [],
      formattableColumns: [],
      recommendedGroupColumns: [],
      otherGroupColumns: [],
      activeGroupLabel: null,
      datePrecisionMode: "monthYear",
      applyDatePrecisionMode: vi.fn(),
    })

    render(
      <ContentToolbar
        seed={{ slug: "posts", branches: [] } as any}
        views={[{ id: "table", label: "Tabella", type: "table", enabledTools: [] as any }]}
        activeViewId="table"
        onChangeView={vi.fn()}
        onCreate={onCreate}
      >
        <div>CHILD</div>
      </ContentToolbar>
    )

    fireEvent.click(screen.getByText("Nuovo"))
    expect(onCreate).toHaveBeenCalled()
    expect(screen.getByText("SEARCH_BAR")).toBeInTheDocument()
    expect(screen.getByText("SETTINGS_MENU")).toBeInTheDocument()
    expect(screen.getByText("CHILD")).toBeInTheDocument()
  })
})
