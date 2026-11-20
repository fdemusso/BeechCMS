// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"
import { ContextMenuItem } from "@/components/ui/context-menu"

type Row = { id: string; name: string; city: string }

const columns: ColumnDef<Row, string>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "city", header: "City" },
]
const data: Row[] = [{ id: "1", name: "alpha", city: "Rome" }]

describe("DataTable header context menu", () => {
  it("right-clicking a header opens the menu rendered for that column", async () => {
    const onPick = vi.fn()
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        renderHeaderContextMenuContent={(columnId) =>
          columnId === "city" ? <ContextMenuItem onSelect={() => onPick(columnId)}>Group {columnId}</ContextMenuItem> : null
        }
      />,
    )

    fireEvent.contextMenu(screen.getByText("City"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Group city" }))

    expect(onPick).toHaveBeenCalledWith("city")
  })

  it("a column whose menu is null opens nothing", () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        renderHeaderContextMenuContent={() => null}
      />,
    )

    fireEvent.contextMenu(screen.getByText("Name"))

    expect(screen.queryByRole("menu")).toBeNull()
  })
})
