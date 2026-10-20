// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"

type Row = { id: string; a: string; b: string; c: string }

const columns: ColumnDef<Row, string>[] = [
  { id: "select", header: "Select", enableHiding: false, cell: () => null },
  { accessorKey: "a", header: "A" },
  { accessorKey: "b", header: "B" },
  { accessorKey: "c", header: "C" },
  { id: "actions", header: "Actions", enableHiding: false, cell: () => null },
]

const data: Row[] = [{ id: "1", a: "a1", b: "b1", c: "c1" }]

function headerLabels() {
  return screen.getAllByRole("columnheader").map((th) => th.textContent)
}

describe("DataTable column order", () => {
  it("keeps the default order without a columnOrder", () => {
    render(<DataTable columns={columns} data={data} />)

    expect(headerLabels()).toEqual(["Select", "A", "B", "C", "Actions"])
  })

  it("applies columnOrder while select stays first and actions last", () => {
    render(<DataTable columns={columns} data={data} columnOrder={["c", "a"]} onColumnOrderChange={() => {}} />)

    expect(headerLabels()).toEqual(["Select", "C", "A", "B", "Actions"])
  })
})
