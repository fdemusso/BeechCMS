// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import React, { use } from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import type { Branch, Seed } from "@beechcms/core"

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/features/content-management", () => ({
  useBulkUpdate: vi.fn(),
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (open ? <dialog open>{children}</dialog> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

// Make Select forward onValueChange when a SelectItem is clicked
vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<any>(null)

  function Select({ children, value, onValueChange }: any) {
    return (
      <SelectContext.Provider value={{ value, onValueChange }}>
        <div data-testid="select" data-value={value}>{children}</div>
      </SelectContext.Provider>
    )
  }
  function SelectTrigger({}: any) {
    return <input aria-expanded={false} aria-controls="select-listbox" readOnly />
  }
  function SelectValue({ placeholder }: any) {
    return <span>{placeholder}</span>
  }
  function SelectContent({ children }: any) {
    return <div id="select-listbox" role="listbox">{children}</div>
  }
  function SelectItem({ children, value }: any) {
    const ctx = use(SelectContext)
    return (
      <button role="option" aria-selected={false} data-value={value} onClick={() => ctx?.onValueChange(value)}>
        {children}
      </button>
    )
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
})

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/progress", () => ({
  Progress: () => <progress />,
}))

vi.mock("@/features/fields", () => ({
  FieldEdit: ({ branch, value, onChange }: any) => (
    <input
      aria-label={`field-${branch.alias}`}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const map: Record<string, string> = {
        "bulkEdit.title": `Edit ${params?.count} entries`,
        "bulkEdit.pickField": "Choose a field to update",
        "bulkEdit.confirm": `Update ${params?.count} entries?`,
        "bulkEdit.executing": "Updating…",
        "bulkEdit.successAll": `${params?.count} entries updated`,
        "bulkEdit.successPartial": `${params?.updated} of ${params?.total} updated. ${params?.failed} failed.`,
        "bulkEdit.downloadReport": "Download failure report",
        "bulkEdit.mode.replace": "Replace",
        "bulkEdit.mode.add": "Add",
        "bulkEdit.mode.remove": "Remove",
        "common.cancel": "Cancel",
        "common.confirm": "Confirm",
        "common.back": "Back",
        "common.close": "Close",
      }
      return map[key] ?? key
    },
  }),
}))

// ── SUT ──────────────────────────────────────────────────────────────────────

import { BulkEditDialog } from "./bulk-edit-dialog"
import { useBulkUpdate } from "@/features/content-management"

const mockSeed: Seed = {
  slug: "posts",
  label: "Post",
  labelPlural: "Posts",
  displayNameAlias: "title",
  allowDrafts: false,
  branches: [
    { alias: "title", label: "Title", type: "text" },
    { alias: "hidden_field", label: "Hidden", type: "text", policies: { visibility: "hidden" } },
    { alias: "secret_field", label: "Secret", type: "text", policies: { privacy: "encrypt" } },
  ] as Branch[],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderDialog(open = true, selectedIds = ["id1", "id2"]) {
  return render(
    <BulkEditDialog
      open={open}
      onOpenChange={vi.fn()}
      seed={mockSeed}
      selectedIds={selectedIds}
      sampleLabels={["Item 1", "Item 2"]}
    />
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BulkEditDialog", () => {
  let mockMutateAsync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockMutateAsync = vi.fn()
    vi.mocked(useBulkUpdate).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any)
  })

  it("renders the step-1 dialog when open=true", () => {
    renderDialog()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Edit 2 entries")).toBeInTheDocument()
    // The prompt text appears in the <p> (exact selector to avoid collision with SelectValue placeholder)
    expect(screen.getAllByText("Choose a field to update").length).toBeGreaterThanOrEqual(1)
  })

  it("does not render when open=false", () => {
    renderDialog(false)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("Confirm is disabled until a field is selected", () => {
    renderDialog()
    const confirm = screen.getByRole("button", { name: "Confirm" })
    expect(confirm).toBeDisabled()
  })

  it("only shows bulk-editable fields in the listbox (no hidden/encrypted)", () => {
    renderDialog()
    const options = screen.getAllByRole("option")
    const labels = options.map(o => o.textContent)
    expect(labels).toContain("Title")
    expect(labels).not.toContain("Hidden")
    expect(labels).not.toContain("Secret")
  })

  it("enables Confirm and moves to step 2 after selecting a field", () => {
    renderDialog()
    fireEvent.click(screen.getByRole("option", { name: "Title" }))
    const confirm = screen.getByRole("button", { name: "Confirm" })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)

    // Step 2: field editor is rendered
    expect(screen.getByLabelText("field-title")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument()
  })

  it("Back from step 2 returns to step 1", () => {
    renderDialog()
    fireEvent.click(screen.getByRole("option", { name: "Title" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    // Step 2
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    // Back to step 1: field editor should be gone, listbox should be visible again
    expect(screen.queryByLabelText("field-title")).not.toBeInTheDocument()
    expect(screen.getByRole("listbox")).toBeInTheDocument()
  })

  it("moves to step 3 (confirm) and shows sample labels", () => {
    renderDialog()
    fireEvent.click(screen.getByRole("option", { name: "Title" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    // Step 2 → step 3
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    expect(screen.getByText("Item 1")).toBeInTheDocument()
    expect(screen.getByText("Item 2")).toBeInTheDocument()
    expect(screen.getByText(/Update 2 entries/)).toBeInTheDocument()
  })

  it("calls bulkUpdate with correct payload and shows success", async () => {
    mockMutateAsync.mockResolvedValueOnce({ updated: 2, failed: [] })
    renderDialog()

    fireEvent.click(screen.getByRole("option", { name: "Title" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    // Step 2: type a value
    fireEvent.change(screen.getByLabelText("field-title"), { target: { value: "New Title" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    // Step 3: execute
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        ids: ["id1", "id2"],
        fields: { title: "New Title" },
      })
      expect(screen.getByText("2 entries updated")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument()
  })

  it("shows partial failure details and download button", async () => {
    mockMutateAsync.mockResolvedValueOnce({
      updated: 1,
      failed: [{ id: "id2", problem: { status: 422, type: "error", detail: "Validation failed" } }],
    })
    renderDialog()

    fireEvent.click(screen.getByRole("option", { name: "Title" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => {
      expect(screen.getByText("1 of 2 updated. 1 failed.")).toBeInTheDocument()
      expect(screen.getByText("id2: Validation failed")).toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: "Download failure report" })).toBeInTheDocument()
  })

  it("handles API throw by mapping all entries to failed", async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error("Network failure"))
    renderDialog()

    fireEvent.click(screen.getByRole("option", { name: "Title" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => {
      expect(screen.getByText("id1: Request failed")).toBeInTheDocument()
      expect(screen.getByText("id2: Request failed")).toBeInTheDocument()
    })
  })
})
