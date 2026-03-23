import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useToolbarMenusState } from "@/components/content-toolbar/toolbar-hooks/use-toolbar-menus-state"
import { useViewName } from "@/components/content-toolbar/toolbar-hooks/use-view-name"
import { useToolbarSearch } from "@/components/content-toolbar/toolbar-hooks/use-toolbar-search"
import { useToolbarSort } from "@/components/content-toolbar/toolbar-hooks/use-toolbar-sort"
import { useToolbarGroupBy } from "@/components/content-toolbar/toolbar-hooks/use-toolbar-groupby"

const seed: any = {
  branches: [
    { alias: "title", label: "Titolo", type: "text" },
    { alias: "count", label: "Conteggio", type: "number" },
    { alias: "createdAt", label: "Data", type: "date" },
    { alias: "published", label: "Pubblicato", type: "boolean" },
  ],
}

describe("toolbar hooks", () => {
  it("useToolbarMenusState gestisce stato locale", () => {
    const { result } = renderHook(() => useToolbarMenusState())
    expect(result.current.filterMenuOpen).toBe(false)
    act(() => result.current.setFilterMenuOpen(true))
    expect(result.current.filterMenuOpen).toBe(true)
  })

  it("useViewName committa solo quando cambia il nome", () => {
    const onRenameView = vi.fn()
    const { result } = renderHook(() =>
      useViewName({
        activeView: { id: "table", label: "Tabella", type: "table", enabledTools: [] as any },
        onRenameView,
      })
    )
    act(() => result.current.setViewNameDraft("  Nuova vista  "))
    act(() => result.current.commitViewName())
    expect(onRenameView).toHaveBeenCalledWith("table", "Nuova vista")
  })

  it("useToolbarSearch apre/chiude e submitta query", () => {
    const onSearchChange = vi.fn()
    const onSubmitSearch = vi.fn()
    const { result } = renderHook(() =>
      useToolbarSearch({ searchValue: "abc", onSearchChange, onSubmitSearch })
    )
    act(() => result.current.handleSearchOpen())
    expect(result.current.isSearchOpen).toBe(true)
    act(() => result.current.handleSearchSubmit({ preventDefault: vi.fn() } as any))
    expect(onSubmitSearch).toHaveBeenCalledWith("abc")
    act(() => result.current.handleSearchClose())
    expect(onSearchChange).toHaveBeenCalledWith("")
  })

  it("useToolbarSort filtra colonne e toggla ordinamento", () => {
    const onSortChange = vi.fn()
    const { result } = renderHook(() =>
      useToolbarSort({
        seed,
        sortColumnSearchTerm: "tit",
        sortState: { columnId: "title", desc: true },
        onSortChange,
      })
    )
    expect(result.current.filteredSortableColumns).toHaveLength(1)
    act(() => result.current.handleToggleSortDirection())
    expect(onSortChange).toHaveBeenCalledWith({ columnId: "title", desc: false })
  })

  it("useToolbarGroupBy espone sezioni e precisione data", () => {
    const onDateGroupPrecisionChange = vi.fn()
    const { result } = renderHook(() =>
      useToolbarGroupBy({
        seed,
        availableStatusOptions: ["draft", "published"],
        groupBy: "createdAt",
        dateGroupPrecision: { year: true, month: false, day: false },
        onDateGroupPrecisionChange,
      })
    )
    expect(result.current.activeGroupLabel).toBe("Data")
    expect(result.current.datePrecisionMode).toBe("year")
    act(() => result.current.applyDatePrecisionMode("day"))
    expect(onDateGroupPrecisionChange).toHaveBeenCalledWith({ year: false, month: false, day: true })
  })
})
