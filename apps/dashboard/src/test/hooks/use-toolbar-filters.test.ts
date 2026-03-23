import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useToolbarFilters } from "@/hooks/use-toolbar-filters"

const seed: any = {
  branches: [
    { alias: "title", label: "Titolo", type: "text" },
    { alias: "price", label: "Prezzo", type: "number" },
    { alias: "createdAt", label: "Data", type: "date" },
    { alias: "isPublished", label: "Pubblicato", type: "boolean" },
    { alias: "tags", label: "Tag", type: "json" },
  ],
}

describe("useToolbarFilters", () => {
  it("genera colonne filtrabili/formattabili e gestisce add/remove/update", () => {
    let currentFilters: any = {}
    const onFiltersChange = vi.fn((next) => {
      currentFilters = next
    })

    const { result, rerender } = renderHook(() =>
      useToolbarFilters({
        seed,
        filters: currentFilters,
        onFiltersChange,
        availableStatusOptions: ["draft"],
      })
    )

    expect(result.current.filterableColumns.some((c) => c.columnId === "status")).toBe(true)
    expect(result.current.formattableColumns.some((c) => c.columnId === "price")).toBe(true)

    act(() => result.current.addConditionToColumn("title"))
    rerender()
    expect(onFiltersChange).toHaveBeenCalled()

    const conditionId = currentFilters.title.conditions[0].id
    act(() => result.current.updateCondition("title", conditionId, { value: "hello" }))
    rerender()
    expect(currentFilters.title.conditions[0].value).toBe("hello")

    act(() => result.current.removeCondition("title", conditionId))
    rerender()
    expect(currentFilters.title).toBeUndefined()
  })

  it("rimuove gruppo colonna intero con removeColumnFilters", () => {
    let currentFilters: any = {
      status: {
        columnId: "status",
        label: "Stato",
        type: "select",
        conditions: [{ id: "c1", op: "eq", value: "draft" }],
      },
    }
    const onFiltersChange = vi.fn((next) => {
      currentFilters = next
    })

    const { result } = renderHook(() =>
      useToolbarFilters({
        seed,
        filters: currentFilters,
        onFiltersChange,
      })
    )

    act(() => result.current.removeColumnFilters("status"))
    expect(onFiltersChange).toHaveBeenCalled()
    expect(currentFilters.status).toBeUndefined()
  })
})
