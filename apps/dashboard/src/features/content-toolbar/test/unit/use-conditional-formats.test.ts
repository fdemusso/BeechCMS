// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useConditionalFormats } from "@/features/content-toolbar/toolbar-hooks/use-conditional-formats"

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

  it("gestisce reorder e rimozione condizioni fino a drop regola", () => {
    let committed: any[] = [
      {
        id: "r1",
        enabled: true,
        priority: 0,
        label: "Stato",
        columnId: "status",
        group: {
          columnId: "status",
          label: "Stato",
          type: "select",
          selectOptions: ["draft"],
          conditions: [
            { id: "c1", op: "eq", value: "draft" },
            { id: "c2", op: "eq", value: "published" },
          ],
        },
        tone: "warning",
        target: "row",
        textStyles: [],
      },
      {
        id: "r2",
        enabled: true,
        priority: 1,
        label: "Stato2",
        columnId: "status",
        group: {
          columnId: "status",
          label: "Stato",
          type: "select",
          selectOptions: ["draft"],
          conditions: [{ id: "c3", op: "eq", value: "draft" }],
        },
        tone: "info",
        target: "row",
        textStyles: [],
      },
    ]
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

    act(() => result.current.moveConditionalRule("r2", -1))
    rerender()
    expect(committed[0].id).toBe("r2")

    act(() => result.current.removeConditionalCondition("r1", "c1"))
    rerender()
    expect(committed.find((r) => r.id === "r1")?.group.conditions).toHaveLength(1)

    act(() => result.current.removeConditionalCondition("r1", "c2"))
    rerender()
    expect(committed.find((r) => r.id === "r1")).toBeUndefined()
  })
})
