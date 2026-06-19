// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Toggle, toggleVariants } from "@/components/ui/toggle"

describe("ui primitives coverage", () => {
  it("renderizza Card family con slot/classi", () => {
    render(
      <Card className="custom-card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )

    expect(screen.getByText("Title")).toBeInTheDocument()
    expect(screen.getByText("Description")).toBeInTheDocument()
    expect(screen.getByText("Content")).toBeInTheDocument()
    expect(screen.getByText("Footer")).toBeInTheDocument()
    expect(document.querySelector('[data-slot="card"]')).toHaveClass("custom-card")
    expect(document.querySelector('[data-slot="card-action"]')).toBeInTheDocument()
  })

  it("renderizza Table family e props principali", () => {
    render(
      <Table>
        <TableCaption>Caption</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Col1</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>Val1</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Tot</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    )

    expect(screen.getByText("Caption")).toBeInTheDocument()
    expect(screen.getByText("Col1")).toBeInTheDocument()
    expect(screen.getByText("Val1")).toBeInTheDocument()
    expect(screen.getByText("Tot")).toBeInTheDocument()
    expect(document.querySelector('[data-slot="table-row"]')).toBeInTheDocument()
  })

  it("renderizza Toggle e applica varianti", () => {
    render(
      <Toggle aria-label="toggle" variant="outline" size="sm">
        T
      </Toggle>
    )
    const toggle = screen.getByRole("button", { name: "toggle" })
    expect(toggle).toBeInTheDocument()
    fireEvent.click(toggle)
    const classes = toggleVariants({ variant: "outline", size: "sm" })
    expect(classes).toContain("border")
    expect(classes).toContain("h-7")
  })
})
