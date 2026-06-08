// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { FieldEditRepeater } from "@/features/fields/edit/repeater"
import { BranchItemRow } from "@/features/fields/edit/repeater-branch-item"
import { getEditComponent } from "@/features/fields"
import type { Branch } from "@beechcms/core"

const repeaterBranch = {
  id: "br_branches",
  alias: "branches",
  label: "Branches",
  type: "repeater",
  repeater: { itemKind: "branch" },
} as unknown as Branch

const items: Branch[] = [
  { id: "br_01", alias: "title", label: "Title", type: "text" } as Branch,
  { id: "br_02", alias: "body", label: "Body", type: "richtext" } as Branch,
]

describe("FieldEditRepeater", () => {
  it("renders one row per item", () => {
    render(<FieldEditRepeater branch={repeaterBranch} value={items} onChange={vi.fn()} />)
    expect(screen.getByText("title")).toBeInTheDocument()
    expect(screen.getByText("body")).toBeInTheDocument()
  })

  it("treats a non-array value as empty", () => {
    render(<FieldEditRepeater branch={repeaterBranch} value={undefined} onChange={vi.fn()} />)
    expect(screen.queryByText("title")).not.toBeInTheDocument()
  })

  it("add appends a br_new_* branch via onChange", () => {
    const onChange = vi.fn()
    render(<FieldEditRepeater branch={repeaterBranch} value={items} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /add item/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Branch[]
    expect(next).toHaveLength(3)
    expect(next[2].id).toMatch(/^br_new_/)
    expect(next[2].alias).toBe("")
  })

  it("remove drops the targeted item", () => {
    const onChange = vi.fn()
    render(<FieldEditRepeater branch={repeaterBranch} value={items} onChange={onChange} />)
    const removeButtons = screen.getAllByRole("button", { name: /remove item/i })
    fireEvent.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith([items[1]])
  })

  it("renders a drag handle per row for reordering", () => {
    render(<FieldEditRepeater branch={repeaterBranch} value={items} onChange={vi.fn()} />)
    expect(screen.getAllByRole("button", { name: /drag to reorder/i })).toHaveLength(items.length)
  })
})

describe("BranchItemRow", () => {
  const existingBranch = { id: "br_01", alias: "title", label: "Title", type: "text" } as Branch
  const newBranch = { id: "br_new_123", alias: "", label: "", type: "text" } as Branch

  it("calls onChange with the updated branch when editing the label", () => {
    const onChange = vi.fn()
    render(
      <BranchItemRow
        branch={existingBranch}
        activeSeedsForRelation={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    // Buttons in row order: drag-handle, collapsible-trigger, remove.
    fireEvent.click(screen.getAllByRole("button")[1])
    const labelInput = screen.getByDisplayValue("Title")
    fireEvent.change(labelInput, { target: { value: "Updated Title" } })
    expect(onChange).toHaveBeenCalledWith({ ...existingBranch, label: "Updated Title" })
  })

  it("alias and type inputs are read-only for an existing branch (id not br_new_*)", () => {
    render(
      <BranchItemRow
        branch={existingBranch}
        activeSeedsForRelation={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    // Buttons in row order: drag-handle, collapsible-trigger, remove.
    fireEvent.click(screen.getAllByRole("button")[1])
    const aliasInput = screen.getByDisplayValue("title") as HTMLInputElement
    const typeInput = screen.getByDisplayValue("text") as HTMLInputElement
    expect(aliasInput.readOnly).toBe(true)
    expect(typeInput.readOnly).toBe(true)
  })

  it("alias input is editable for a new branch (id starting with br_new_)", () => {
    render(
      <BranchItemRow
        branch={newBranch}
        activeSeedsForRelation={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    // Buttons in row order: drag-handle, collapsible-trigger, remove.
    fireEvent.click(screen.getAllByRole("button")[1])
    const aliasInput = screen.getByPlaceholderText("field_name") as HTMLInputElement
    expect(aliasInput.readOnly).toBe(false)
  })
})

describe("registry", () => {
  it("getEditComponent('repeater') resolves to FieldEditRepeater", () => {
    expect(getEditComponent("repeater" as never)).toBe(FieldEditRepeater)
  })
})
