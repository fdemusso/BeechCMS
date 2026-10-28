// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"

// Regression guards for the invariants documented in ./README.md. Each test names the bug it prevents.

type Row = { id: string; title: string }

const columns: ColumnDef<Row, string>[] = [{ accessorKey: "title", header: "Title" }]

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: String(i), title: `row-${i}` }))
}

/** Server-side paginated table whose page index lives in the parent, like the content list. */
function ServerPaginatedTable({ rowsOnPage, totalRows, pageSize }: Readonly<{ rowsOnPage: number; totalRows: number; pageSize: number }>) {
  const [pageIndex, setPageIndex] = React.useState(0)
  return (
    <DataTable
      columns={columns}
      data={makeRows(rowsOnPage)}
      manualPagination
      pageSize={pageSize}
      pageIndex={pageIndex}
      onPageIndexChange={setPageIndex}
      pageCount={Math.ceil(totalRows / pageSize)}
      totalRows={totalRows}
    />
  )
}

/** Body rows only: the header row is excluded; placeholders are the ones hidden from assistive tech. */
function bodyRows() {
  return screen.getAllByRole("row", { hidden: true }).slice(1)
}

describe("DataTable page layout", () => {
  it("pads a short last page with inert placeholder rows up to pageSize", () => {
    render(<ServerPaginatedTable rowsOnPage={4} totalRows={24} pageSize={10} />)

    const rows = bodyRows()

    expect(rows).toHaveLength(10)
    expect(rows.filter((row) => row.getAttribute("aria-hidden") === "true")).toHaveLength(6)
  })

  it("does not pad a dataset that is smaller than one page", () => {
    render(<ServerPaginatedTable rowsOnPage={3} totalRows={3} pageSize={10} />)

    const rows = bodyRows()

    expect(rows).toHaveLength(3)
  })

  it("draws the outer border on a clipping frame so the header background cannot bleed past the rounded corners", () => {
    const { container } = render(<ServerPaginatedTable rowsOnPage={3} totalRows={3} pageSize={10} />)

    const frame = container.querySelector("[data-datatable-root]")

    expect(frame?.className).toContain("overflow-hidden")
    expect(frame?.className).toContain("rounded-md")
  })
})

describe("DataTable pagination footer", () => {
  it("repaints the page counter when Next is pressed", () => {
    render(<ServerPaginatedTable rowsOnPage={10} totalRows={30} pageSize={10} />)

    fireEvent.click(screen.getByText("Next"))

    expect(screen.getByText("2")).toBeTruthy()
  })

  it("re-enables Previous after moving past the first page", () => {
    render(<ServerPaginatedTable rowsOnPage={10} totalRows={30} pageSize={10} />)
    // classList, not className: the Button base style always contains the "disabled:pointer-events-none" substring.
    const isPreviousDisabled = () => screen.getByText("Previous").closest("a")?.classList.contains("pointer-events-none")
    expect(isPreviousDisabled()).toBe(true)

    fireEvent.click(screen.getByText("Next"))

    expect(isPreviousDisabled()).toBe(false)
  })
})
