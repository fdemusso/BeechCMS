import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useConditionalFormats } from "@/hooks/use-conditional-formats"

const columns = [{ columnId: "status", label: "Stato", type: "select", selectOptions: ["draft"] }] as any

describe("useConditionalFormats", () => {
  it("normalizza, aggiunge, aggiorna e rimuove regole", () => {
    let committed: any[] = []
    const onConditionalFormatsChange = vi.fn((_viewId, next) => {
      committed = next
    })

    const { result, rerender } = renderHook(() =>
      useConditionalFormats({
        viewId: "table",
        conditionalFormatsInput: committed,
        formattableColumns: columns,
        onConditionalFormatsChange,
      })
    )

    act(() => result.current.addConditionalFormatRule("status"))
    rerender()
    expect(onConditionalFormatsChange).toHaveBeenCalled()
    expect(committed.length).toBe(1)

    const id = committed[0].id
    act(() => result.current.updateConditionalRule(id, { tone: "danger" as const }))
    rerender()
    expect(committed[0].tone).toBe("danger")

    const conditionId = committed[0].group.conditions[0].id
    act(() => result.current.updateConditionalCondition(id, conditionId, { value: "draft" }))
    rerender()
    expect(committed[0].group.conditions[0].value).toBe("draft")

    act(() => result.current.removeConditionalRule(id))
    rerender()
    expect(committed.length).toBe(0)
  })
})
