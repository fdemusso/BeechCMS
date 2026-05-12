import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

import { ContentDeleteDialog } from "@/features/content-delete-dialog/content-delete-dialog"

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

    expect(screen.getByText(/Are you sure you want to delete this entry/i)).toBeInTheDocument()
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

    expect(screen.getByText(/delete 4 entries/i)).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }))

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

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }))

    expect(await screen.findByText("Custom delete error")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

