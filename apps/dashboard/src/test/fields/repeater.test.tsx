// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { FieldEditRepeater } from "@/features/fields/edit/repeater"
import { BranchItemRow } from "@/features/fields/edit/repeater-branch-item"
import { GenericItemRow } from "@/features/fields/edit/repeater-generic-item"
import { RepeaterDisplay } from "@/features/fields/display/repeater"
import { getEditComponent, getDisplayComponent } from "@/features/fields"
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

  it("getDisplayComponent('repeater') resolves to RepeaterDisplay", () => {
    expect(getDisplayComponent("repeater" as never)).toBe(RepeaterDisplay)
  })
})

// ─── GenericItemRow (Sprint 10) ────────────────────────────────────────────────

describe("GenericItemRow", () => {
  const subBranches: Branch[] = [
    { id: "br_q", alias: "question", label: "Question", type: "text" } as Branch,
    { id: "br_done", alias: "done", label: "Done", type: "boolean" } as Branch,
  ]

  it("renders a field per sub-branch via the registry edit component", () => {
    render(
      <GenericItemRow
        id="item-0"
        subBranches={subBranches}
        value={{ question: "Why?", done: false }}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue("Why?")).toBeInTheDocument()
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0)
  })

  it("calls onChange with the updated record when a sub-field changes", () => {
    const onChange = vi.fn()
    render(
      <GenericItemRow
        id="item-0"
        subBranches={subBranches}
        value={{ question: "Why?", done: false }}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    fireEvent.change(screen.getByDisplayValue("Why?"), { target: { value: "Why not?" } })
    expect(onChange).toHaveBeenCalledWith({ question: "Why not?", done: false })
  })

  it("calls onRemove when the remove button is clicked", () => {
    const onRemove = vi.fn()
    render(
      <GenericItemRow
        id="item-0"
        subBranches={subBranches}
        value={{ question: "Why?", done: false }}
        onChange={vi.fn()}
        onRemove={onRemove}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /remove item/i }))
    expect(onRemove).toHaveBeenCalled()
  })

  it("does not render disallowed sub-types (relation/file/nested repeater)", () => {
    const disallowed: Branch[] = [
      ...subBranches,
      { id: "br_rel", alias: "related", label: "Related", type: "relation", targetSeed: "tags" } as Branch,
      { id: "br_file", alias: "asset", label: "Asset", type: "file" } as Branch,
      { id: "br_nested", alias: "nested", label: "Nested", type: "repeater", fields: [] } as Branch,
    ]
    render(
      <GenericItemRow
        id="item-0"
        subBranches={disallowed}
        value={{ question: "Why?", done: false }}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.queryByText("Related")).not.toBeInTheDocument()
    expect(screen.queryByText("Asset")).not.toBeInTheDocument()
    expect(screen.queryByText("Nested")).not.toBeInTheDocument()
  })
})

// ─── RepeaterDisplay (Sprint 10) ────────────────────────────────────────────────

describe("RepeaterDisplay", () => {
  const branch = { id: "br_items", alias: "items", label: "Items", type: "repeater" } as unknown as Branch

  it("shows a placeholder for an empty array", () => {
    render(<RepeaterDisplay branch={branch} value={[]} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("shows a placeholder for a non-array value", () => {
    render(<RepeaterDisplay branch={branch} value={null} />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("shows the item count for a non-empty array", () => {
    render(<RepeaterDisplay branch={branch} value={[{ question: "A" }, { question: "B" }]} />)
    expect(screen.getByText("2 items")).toBeInTheDocument()
  })

  it("uses singular form for a single item", () => {
    render(<RepeaterDisplay branch={branch} value={[{ question: "A" }]} />)
    expect(screen.getByText("1 item")).toBeInTheDocument()
  })
})

// ─── FieldEditRepeater: 'fields' item kind (Sprint 10) ──────────────────────────

describe("FieldEditRepeater (itemKind: fields)", () => {
  const repeaterBranch = {
    id: "br_items",
    alias: "items",
    label: "Items",
    type: "repeater",
    fields: [
      { id: "br_q", alias: "question", label: "Question", type: "text" },
      { id: "br_a", alias: "answer", label: "Answer", type: "text" },
    ],
  } as unknown as Branch

  it("renders a GenericItemRow per item", () => {
    render(
      <FieldEditRepeater
        branch={repeaterBranch}
        value={[{ question: "Q1", answer: "A1" }, { question: "Q2", answer: "A2" }]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue("Q1")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Q2")).toBeInTheDocument()
  })

  it("add seeds a blank record from branch.fields", () => {
    const onChange = vi.fn()
    render(<FieldEditRepeater branch={repeaterBranch} value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /add item/i }))
    expect(onChange).toHaveBeenCalledWith([{ question: "", answer: "" }])
  })
})

// ─── FieldEditRepeater: cardinality bounds (Sprint 11) ──────────────────────────

describe("FieldEditRepeater cardinality bounds", () => {
  const boundedBranch = {
    id: "br_items",
    alias: "items",
    label: "Items",
    type: "repeater",
    fields: [
      { id: "br_q", alias: "question", label: "Question", type: "text" },
    ],
  } as unknown as Branch

  it("hides Add when maxItems: 1 and one item is present", () => {
    render(
      <FieldEditRepeater
        branch={{ ...boundedBranch, maxItems: 1 }}
        value={[{ question: "Q1" }]}
        onChange={vi.fn()}
      />
    )
    expect(screen.queryByRole("button", { name: /add item/i })).not.toBeInTheDocument()
  })

  it("disables remove when minItems: 1 and one item is present", () => {
    render(
      <FieldEditRepeater
        branch={{ ...boundedBranch, minItems: 1 }}
        value={[{ question: "Q1" }]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole("button", { name: /remove item/i })).toBeDisabled()
  })

  it("allows add/remove when no bounds are set", () => {
    render(
      <FieldEditRepeater
        branch={boundedBranch}
        value={[{ question: "Q1" }]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole("button", { name: /add item/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /remove item/i })).toBeEnabled()
  })
})

// ─── BranchItemRow: repeater sub-fields (Sprint 10 — Sprint 06 interaction) ────

describe("BranchItemRow as a repeater sub-field (subField=true)", () => {
  const subFieldBranch = { id: "br_q", alias: "question", label: "Question", type: "text" } as Branch

  it("alias and type inputs are editable even though the id is not br_new_*", () => {
    render(
      <BranchItemRow
        branch={subFieldBranch}
        activeSeedsForRelation={[]}
        subField
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])
    const aliasInput = screen.getByDisplayValue("question") as HTMLInputElement
    expect(aliasInput.readOnly).toBe(false)
  })

  it("does not offer relation/file/repeater as sub-field types", () => {
    render(
      <BranchItemRow
        branch={{ ...subFieldBranch, id: "br_new_1" }}
        activeSeedsForRelation={[]}
        subField
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])
    fireEvent.click(screen.getAllByRole("combobox")[0])
    expect(screen.queryByText("Relation")).not.toBeInTheDocument()
    expect(screen.queryByText("File / Media")).not.toBeInTheDocument()
    expect(screen.queryByText("Repeater")).not.toBeInTheDocument()
  })

  it("does not show the Policies section", () => {
    render(
      <BranchItemRow
        branch={subFieldBranch}
        activeSeedsForRelation={[]}
        subField
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])
    expect(screen.queryByText("Policies")).not.toBeInTheDocument()
  })
})

// ─── BranchItemRow: 'repeater' top-level branch type (Seed Builder, Sprint 10) ─

describe("BranchItemRow with branch.type === 'repeater'", () => {
  const repeaterBranch = {
    id: "br_items", alias: "items", label: "Items", type: "repeater", fields: [],
  } as unknown as Branch

  it("renders a nested sub-field editor with an 'add field' button", () => {
    render(
      <BranchItemRow
        branch={repeaterBranch}
        activeSeedsForRelation={[]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])
    expect(screen.getByRole("button", { name: /add field/i })).toBeInTheDocument()
  })

  it("adding a sub-field updates branch.fields via onChange", () => {
    const onChange = vi.fn()
    render(
      <BranchItemRow
        branch={repeaterBranch}
        activeSeedsForRelation={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])
    fireEvent.click(screen.getByRole("button", { name: /add field/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0] as Branch
    expect(updated.fields).toHaveLength(1)
    expect(updated.fields?.[0].id).toMatch(/^br_new_/)
  })

  it("editing minItems updates the branch via onChange (Sprint 11)", () => {
    const onChange = vi.fn()
    render(
      <BranchItemRow
        branch={repeaterBranch}
        activeSeedsForRelation={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])

    const [minItemsInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]
    fireEvent.change(minItemsInput, { target: { value: "1" } })
    expect(onChange).toHaveBeenLastCalledWith({ ...repeaterBranch, minItems: 1 })
  })

  it("editing maxItems updates the branch via onChange (Sprint 11)", () => {
    const onChange = vi.fn()
    render(
      <BranchItemRow
        branch={{ ...repeaterBranch, minItems: 1 }}
        activeSeedsForRelation={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])

    const [, maxItemsInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]
    fireEvent.change(maxItemsInput, { target: { value: "5" } })
    expect(onChange).toHaveBeenLastCalledWith({ ...repeaterBranch, minItems: 1, maxItems: 5 })
  })

  it("clearing maxItems falls back to undefined (Sprint 11)", () => {
    const onChange = vi.fn()
    render(
      <BranchItemRow
        branch={{ ...repeaterBranch, maxItems: 5 }}
        activeSeedsForRelation={[]}
        onChange={onChange}
        onRemove={vi.fn()}
      />
    )
    fireEvent.click(screen.getAllByRole("button")[1])

    const [, maxItemsInput] = screen.getAllByRole("spinbutton") as HTMLInputElement[]
    fireEvent.change(maxItemsInput, { target: { value: "" } })
    expect(onChange).toHaveBeenLastCalledWith({ ...repeaterBranch, maxItems: undefined })
  })
})
