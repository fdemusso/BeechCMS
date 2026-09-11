// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import type { ContentEntry } from "@/lib/dynamic-columns"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function makeEntry(id: string): ContentEntry {
  return { id, schema_slug: "test", slug: id, status: "published", data: {}, created_at: null, updated_at: null }
}

const cols: ColumnDef<ContentEntry, unknown>[] = [
  { id: "id", accessorKey: "id", header: "ID", cell: ({ row }) => row.original.id },
]

describe("DataTable — density", () => {
  it("compact: data rows have height 36px", () => {
    const entry = makeEntry("e1")
    const { getAllByRole } = render(
      <DataTable columns={cols} data={[entry]} density="compact" />
    )
    getAllByRole("row").filter((r) => r.getAttribute("data-state") !== null || r.style.height !== "")
    // Find the data row — it must have height 36
    const dataRows = getAllByRole("row").filter((r) => r.style.height === "36px")
    expect(dataRows.length).toBeGreaterThan(0)
  })

  it("comfortable: data rows have height 64px", () => {
    const entry = makeEntry("e1")
    const { getAllByRole } = render(
      <DataTable columns={cols} data={[entry]} density="comfortable" />
    )
    const dataRows = getAllByRole("row").filter((r) => r.style.height === "64px")
    expect(dataRows.length).toBeGreaterThan(0)
  })

  it("normal (default): data rows have height 48px", () => {
    const entry = makeEntry("e1")
    const { getAllByRole } = render(
      <DataTable columns={cols} data={[entry]} />
    )
    const dataRows = getAllByRole("row").filter((r) => r.style.height === "48px")
    expect(dataRows.length).toBeGreaterThan(0)
  })
})

describe("DataTable — column resizing", () => {
  it("header <th> receives width from columnSizing when enableColumnResizing", () => {
    const entry = makeEntry("e1")
    const sizingCols: ColumnDef<ContentEntry, unknown>[] = [
      { id: "id", accessorKey: "id", header: "ID", cell: ({ row }) => row.original.id, size: 200 },
    ]
    const { getAllByRole } = render(
      <DataTable
        columns={sizingCols}
        data={[entry]}
        enableColumnResizing
        columnSizing={{ id: 300 }}
      />
    )
    const headers = getAllByRole("columnheader")
    const idHeader = headers.find((h) => h.style.width !== "")
    expect(idHeader).toBeTruthy()
    expect(idHeader?.style.width).toBe("300px")
  })
})
