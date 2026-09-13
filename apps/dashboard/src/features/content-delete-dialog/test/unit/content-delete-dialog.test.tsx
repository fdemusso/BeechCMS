// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

import { ContentDeleteDialog } from "@/features/content-delete-dialog/content-delete-dialog"

vi.mock("@/features/shared/hooks/use-permissions", () => ({ usePermissions: () => ({ can: () => true, canAnywhere: () => true, effective: {} }) }))

const seed = {
  slug: "items",
  label: "Item",
  labelPlural: "Items",
  branches: [],
} as any

describe("ContentDeleteDialog", () => {
  it("entry singola: mostra testo al singolare e id preview", async () => {
    render(
      <ContentDeleteDialog
        open
        onOpenChange={vi.fn()}
        seed={seed}
        entryIds={["id-1"]}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByText(/Delete this .*entry forever/i)).toBeInTheDocument()
    expect(screen.getByText(/ID: id-1/)).toBeInTheDocument()
  })

  it("entry multiple: testo al plurale e anteprima con ellissi quando >3", () => {
    render(
      <ContentDeleteDialog
        open
        onOpenChange={vi.fn()}
        seed={seed}
        entryIds={["id-1", "id-2", "id-3", "id-4"]}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByText(/Delete 4 .*entries forever/i)).toBeInTheDocument()
    expect(screen.getByText(/ID: id-1, id-2, id-3, …/)).toBeInTheDocument()
  })

  it("click Annulla chiude il dialog", () => {
    const onOpenChange = vi.fn()
    render(
      <ContentDeleteDialog
        open
        onOpenChange={onOpenChange}
        seed={seed}
        entryIds={["id-1"]}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("onConfirm successo: stato deleting e chiusura dialog", async () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    render(
      <ContentDeleteDialog
        open
        onOpenChange={onOpenChange}
        seed={seed}
        entryIds={["id-1"]}
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("onConfirm errore: mostra messaggio e non chiude", async () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn().mockRejectedValue(new Error("Custom delete error"))

    render(
      <ContentDeleteDialog
        open
        onOpenChange={onOpenChange}
        seed={seed}
        entryIds={["id-1"]}
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }))

    expect(await screen.findByText("Custom delete error")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("a trash-mode dialog offers a reversible move and no irreversibility warning", () => {
    render(
      <ContentDeleteDialog
        open
        onOpenChange={vi.fn()}
        seed={seed}
        entryIds={["id-1"]}
        mode="trash"
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getAllByText(/Move to Trash/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument()
  })

  it("a purge-mode dialog states the deletion is permanent", () => {
    render(
      <ContentDeleteDialog
        open
        onOpenChange={vi.fn()}
        seed={seed}
        entryIds={["id-1"]}
        mode="purge"
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })
})

