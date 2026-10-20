// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"

import { useToolbarMenusState } from "@/features/content-toolbar/toolbar-hooks/use-toolbar-menus-state"
import { useViewName } from "@/features/content-toolbar/toolbar-hooks/use-view-name"
import { useToolbarSearch } from "@/features/content-toolbar/toolbar-hooks/use-toolbar-search"
import { useToolbarSort } from "@/features/content-toolbar/toolbar-hooks/use-toolbar-sort"
import { useToolbarGroupBy } from "@/features/content-toolbar/toolbar-hooks/use-toolbar-groupby"

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
        activeView: { id: "table", label: "Tabella", type: "table", enabledTools: [] as any, settings: [] },
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

  it("useToolbarSearch parte aperto con una query attiva e si apre se la query arriva dopo", () => {
    const { result } = renderHook(
      ({ searchValue }) => useToolbarSearch({ searchValue }),
      { initialProps: { searchValue: "shoes" } },
    )
    expect(result.current.isSearchOpen).toBe(true)

    const closed = renderHook(
      ({ searchValue }) => useToolbarSearch({ searchValue }),
      { initialProps: { searchValue: "" } },
    )
    expect(closed.result.current.isSearchOpen).toBe(false)
    closed.rerender({ searchValue: "boots" })
    expect(closed.result.current.isSearchOpen).toBe(true)
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

  it("useToolbarSort omits multiple-choice tags branches from the sortable columns", () => {
    const posts = CANONICAL_SEEDS.find((candidate) => candidate.slug === "posts") as Seed

    const { result } = renderHook(() =>
      useToolbarSort({ seed: posts, sortColumnSearchTerm: "", sortState: undefined, onSortChange: vi.fn() })
    )

    const sortableAliases = result.current.filteredSortableColumns.map((branch) => branch.alias)
    expect(sortableAliases).toContain("priority")
    expect(sortableAliases).not.toContain("tags")
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
