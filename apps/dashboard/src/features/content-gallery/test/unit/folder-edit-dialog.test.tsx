// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { FolderEditDialog } from "@/features/content-gallery/gallery-components/folder-edit-dialog"

function renderDialog(props: Partial<React.ComponentProps<typeof FolderEditDialog>> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <FolderEditDialog open onClose={onClose} defaultLabel="Wedding" style={undefined} onSave={onSave} {...props} />
  )
  return { onSave, onClose }
}

describe("FolderEditDialog", () => {
  it("saves only the fields the user filled in", () => {
    const { onSave } = renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "Red" }))
    fireEvent.click(screen.getByRole("button", { name: "Heart" }))
    fireEvent.click(screen.getByText("Save"))

    expect(onSave).toHaveBeenCalledWith({ color: "red", icon: "Heart" })
  })

  it("preloads the saved style and trims the label on save", () => {
    const { onSave } = renderDialog({ style: { color: "blue", label: "Old" } })

    fireEvent.change(screen.getByPlaceholderText("Wedding"), { target: { value: "  New  " } })
    fireEvent.click(screen.getByText("Save"))

    expect(onSave).toHaveBeenCalledWith({ color: "blue", label: "New" })
  })

  it("clicking the selected color again clears it", () => {
    const { onSave } = renderDialog({ style: { color: "blue" } })

    fireEvent.click(screen.getByRole("button", { name: "Blue" }))
    fireEvent.click(screen.getByText("Save"))

    expect(onSave).toHaveBeenCalledWith({})
  })

  it("reset saves an empty style", () => {
    const { onSave } = renderDialog({ style: { color: "blue", icon: "Star" } })

    fireEvent.click(screen.getByText("Reset"))

    expect(onSave).toHaveBeenCalledWith({})
  })

  it("styles the reset button as destructive", () => {
    renderDialog()

    expect(screen.getByText("Reset").className).toContain("text-destructive")
  })
})
