// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"

type Row = { id: string; name: string }

const columns: ColumnDef<Row, string>[] = [
  { accessorKey: "name", header: "Name" },
  {
    id: "actions",
    header: "Actions",
    cell: () => <button type="button">Row action</button>,
  },
]

const data: Row[] = [
  { id: "1", name: "alpha" },
  { id: "2", name: "beta" },
]

function Harness({ initial = {}, onActivate }: { initial?: RowSelectionState; onActivate?: (row: Row) => void }) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(initial)
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowDoubleClick={onActivate}
      />
      <output data-testid="selection">{Object.keys(rowSelection).filter((k) => rowSelection[k]).join(",")}</output>
    </>
  )
}

describe("DataTable row click", () => {
  it("a plain click on a row selects only that row", async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ "1": true }} />)

    await user.click(screen.getByText("beta"))

    await waitFor(() => expect(screen.getByTestId("selection").textContent).toBe("2"))
  })

  it("a double click opens the row without the single-click selection landing first", async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    render(<Harness initial={{ "1": true }} onActivate={onActivate} />)

    await user.dblClick(screen.getByText("beta"))
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(onActivate).toHaveBeenCalledWith({ id: "2", name: "beta" })
    expect(screen.getByTestId("selection").textContent).toBe("1")
  })

  it("a click on a button inside the row does not change the selection", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getAllByRole("button", { name: "Row action" })[0])
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(screen.getByTestId("selection").textContent).toBe("")
  })
})
