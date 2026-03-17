import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { DataTable } from "@/components/ui/data-table"
import { generateColumns, type ContentEntry } from "@/lib/dynamic-columns"

function makeSeed() {
  return {
    slug: "items",
    label: "Item",
    labelPlural: "Items",
    branches: [],
  } as any
}

function renderTable({
  selectedIds,
  onDelete,
  onBulkDelete,
}: {
  selectedIds: string[]
  onDelete: (id: string) => void
  onBulkDelete?: (ids: string[]) => void
}) {
  const seed = makeSeed()
  const entry: ContentEntry = {
    id: "id-1",
    schema_slug: "items",
    slug: "entry-1",
    status: "draft",
    data: {},
    created_at: null,
    updated_at: null,
  }

  const columns = generateColumns(
    seed,
    () => {},
    onDelete,
    undefined,
    selectedIds,
    onBulkDelete
  )

  render(<DataTable columns={columns} data={[entry]} />)
}

describe("Actions menu (3 puntini) – bulk selection", () => {
  it("con 2+ selezionate mostra solo Elimina e chiama bulk delete", async () => {
    const onDelete = vi.fn()
    const onBulkDelete = vi.fn()

    renderTable({
      selectedIds: ["id-1", "id-2"],
      onDelete,
      onBulkDelete,
    })

    fireEvent.pointerDown(screen.getByRole("button", { name: /apri menu/i }))

    expect(await screen.findByText("Elimina")).toBeInTheDocument()
    expect(screen.queryByText("Copia ID")).not.toBeInTheDocument()
    expect(screen.queryByText("Modifica")).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("Elimina"))

    expect(onBulkDelete).toHaveBeenCalledTimes(1)
    expect(onBulkDelete).toHaveBeenCalledWith(["id-1", "id-2"])
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("senza bulk selection mostra anche Copia ID/Modifica e Elimina chiama delete singola", async () => {
    const onDelete = vi.fn()
    const onBulkDelete = vi.fn()

    renderTable({
      selectedIds: [],
      onDelete,
      onBulkDelete,
    })

    fireEvent.pointerDown(screen.getByRole("button", { name: /apri menu/i }))

    expect(await screen.findByText("Copia ID")).toBeInTheDocument()
    expect(screen.getByText("Modifica")).toBeInTheDocument()
    expect(screen.getByText("Elimina")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Elimina"))

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith("id-1")
    expect(onBulkDelete).not.toHaveBeenCalled()
  })
})

