// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { GalleryNewFolderDialog } from "@/features/content-gallery/gallery-components/gallery-new-folder-dialog"

// Test env lingua di default "en" (src/test/setup.ts): le assertion sotto
// usano le stringhe inglesi.
describe("GalleryNewFolderDialog", () => {
  it("mostra titolo e descrizione quando aperto", () => {
    render(<GalleryNewFolderDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText("New folder")).toBeInTheDocument()
  })

  it("il bottone di conferma è disabilitato finché il nome è vuoto o solo spazi", () => {
    render(<GalleryNewFolderDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    const confirm = screen.getByRole("button", { name: "Create and add photo" })
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "   " } })
    expect(confirm).toBeDisabled()
  })

  it("alla conferma chiama onConfirm con il nome ripulito dagli spazi ai bordi", () => {
    const onConfirm = vi.fn()
    render(<GalleryNewFolderDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "  Communion  " } })
    fireEvent.click(screen.getByRole("button", { name: "Create and add photo" }))

    expect(onConfirm).toHaveBeenCalledWith("Communion")
  })

  it("il bottone Annulla chiude il dialog senza chiamare onConfirm", () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(<GalleryNewFolderDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "Baptism" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("riapre con il campo vuoto anche se la volta precedente conteneva del testo", () => {
    const { rerender } = render(
      <GalleryNewFolderDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />
    )
    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "Baptism" } })

    rerender(<GalleryNewFolderDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    rerender(<GalleryNewFolderDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />)

    expect(screen.getByLabelText("Folder name")).toHaveValue("")
  })
})
