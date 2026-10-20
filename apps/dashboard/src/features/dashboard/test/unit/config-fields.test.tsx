// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import type { AggregateFormula, Seed } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import {
  FieldRow,
  TextField,
  TextAreaField,
  NumberField,
  SwitchField,
  VariantSelect,
  SeedSelect,
  BranchAliasSelect,
  WindowSelect,
  FormulaEditor,
} from "@/features/dashboard/builder/config-fields"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const SEEDS: Seed[] = [
  {
    slug: "posts",
    label: "Posts",
    branches: [
      { id: "br_01", alias: "title", type: "text", label: "Title" },
      { id: "br_02", alias: "views", type: "number", label: "Views" },
      { id: "br_03", alias: "likes", type: "number", label: "Likes" },
    ],
  } as unknown as Seed,
  {
    slug: "pages",
    label: "Pages",
    branches: [
      { id: "br_10", alias: "slug", type: "text", label: "Slug" },
    ],
  } as unknown as Seed,
]

describe("config-fields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: SEEDS })
  })

  it("FieldRow renders label and children", () => {
    render(
      <FieldRow label="My Label">
        <span>child content</span>
      </FieldRow>,
    )
    expect(screen.getByText("My Label")).toBeInTheDocument()
    expect(screen.getByText("child content")).toBeInTheDocument()
  })

  it("TextField renders value and calls onChange on typing", async () => {
    const onChange = vi.fn()
    render(<TextField label="Name" value="hello" onChange={onChange} placeholder="ph" />)
    const input = screen.getByDisplayValue("hello")
    await userEvent.type(input, "!")
    expect(onChange).toHaveBeenCalled()
  })

  it("TextField handles undefined value", () => {
    const { container } = render(<TextField label="Name" value={undefined} onChange={vi.fn()} />)
    const input = container.querySelector("input") as HTMLInputElement
    expect(input.value).toBe("")
  })

  it("TextAreaField renders value and calls onChange", async () => {
    const onChange = vi.fn()
    render(<TextAreaField label="Body" value="abc" onChange={onChange} rows={6} />)
    const textarea = screen.getByDisplayValue("abc")
    expect(textarea).toHaveAttribute("rows", "6")
    await userEvent.type(textarea, "d")
    expect(onChange).toHaveBeenCalled()
  })

  it("TextAreaField defaults rows to 4 and handles undefined value", () => {
    const { container } = render(<TextAreaField label="Body" value={undefined} onChange={vi.fn()} />)
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement
    expect(textarea).toHaveAttribute("rows", "4")
    expect(textarea.value).toBe("")
  })

  it("NumberField renders numeric value and calls onChange with Number on input", async () => {
    const onChange = vi.fn()
    render(<NumberField label="Limit" value={5} onChange={onChange} min={0} max={100} />)
    const input = screen.getByDisplayValue("5") as HTMLInputElement
    expect(input).toHaveAttribute("type", "number")
    expect(input).toHaveAttribute("min", "0")
    expect(input).toHaveAttribute("max", "100")

    await userEvent.type(input, "9")
    expect(onChange).toHaveBeenLastCalledWith(59)
  })

  it("NumberField calls onChange with undefined when cleared", async () => {
    const onChange = vi.fn()
    render(<NumberField label="Limit" value={5} onChange={onChange} />)
    const input = screen.getByDisplayValue("5")
    await userEvent.clear(input)
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it("SwitchField renders label and toggles checked state", async () => {
    const onChange = vi.fn()
    render(<SwitchField label="Show trend" checked={false} onChange={onChange} />)
    expect(screen.getByText("Show trend")).toBeInTheDocument()
    const switchEl = screen.getByRole("switch")
    expect(switchEl).not.toBeChecked()
    await userEvent.click(switchEl)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("VariantSelect renders options and calls onChange on selection", async () => {
    const onChange = vi.fn()
    render(
      <VariantSelect
        label="Variant"
        value="a"
        options={[
          { value: "a", labelKey: "common.add" },
          { value: "b", labelKey: "common.save" },
        ]}
        onChange={onChange}
      />,
    )
    const trigger = screen.getByRole("combobox")
    await userEvent.click(trigger)
    const option = await screen.findByRole("option", { name: "Save" })
    await userEvent.click(option)
    expect(onChange).toHaveBeenCalledWith("b")
  })

  it("SeedSelect lists seeds from schema and calls onChange when one is selected", async () => {
    const onChange = vi.fn()
    renderWithClient(<SeedSelect value={undefined} onChange={onChange} />)

    const trigger = screen.getByRole("combobox")
    await userEvent.click(trigger)

    const option = await screen.findByRole("option", { name: "Posts" })
    await userEvent.click(option)
    expect(onChange).toHaveBeenCalledWith("posts")
  })

  it("SeedSelect renders custom label", async () => {
    renderWithClient(<SeedSelect value={undefined} onChange={vi.fn()} label="Custom label" />)
    expect(screen.getByText("Custom label")).toBeInTheDocument()
  })

  it("BranchAliasSelect is disabled without a seedSlug", () => {
    renderWithClient(<BranchAliasSelect seedSlug={undefined} value={undefined} onChange={vi.fn()} />)
    const trigger = screen.getByRole("combobox")
    expect(trigger).toBeDisabled()
  })

  it("BranchAliasSelect lists branches for the given seed and respects a filter", async () => {
    const onChange = vi.fn()
    renderWithClient(
      <BranchAliasSelect
        seedSlug="posts"
        value={undefined}
        onChange={onChange}
        filter={(b) => b.type === "number"}
      />,
    )

    const trigger = screen.getByRole("combobox")
    expect(trigger).not.toBeDisabled()
    await userEvent.click(trigger)

    expect(await screen.findByRole("option", { name: "Views" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Likes" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Title" })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("option", { name: "Views" }))
    expect(onChange).toHaveBeenCalledWith("views")
  })

  it("WindowSelect defaults to 'all' and calls onChange with selected window", async () => {
    const onChange = vi.fn()
    renderWithClient(<WindowSelect value={undefined} onChange={onChange} />)

    const trigger = screen.getByRole("combobox")
    await userEvent.click(trigger)

    const option = await screen.findByRole("option", { name: "Last week" })
    await userEvent.click(option)
    expect(onChange).toHaveBeenCalledWith("week")
  })

  describe("FormulaEditor", () => {
    it("defaults to count and switches to sum with a column selector", async () => {
      const onChange = vi.fn()
      renderWithClient(<FormulaEditor seedSlug="posts" value={undefined} onChange={onChange} />)

      const trigger = screen.getByRole("combobox")
      await userEvent.click(trigger)
      const sumOption = await screen.findByRole("option", { name: "Sum" })
      await userEvent.click(sumOption)
      expect(onChange).toHaveBeenCalledWith({ op: "sum", column: "" })
    })

    it("renders column selector for sum/avg/min/max formulas filtered to numeric branches", async () => {
      const onChange = vi.fn()
      const value: AggregateFormula = { op: "avg", column: "" }
      renderWithClient(<FormulaEditor seedSlug="posts" value={value} onChange={onChange} />)

      const comboboxes = screen.getAllByRole("combobox")
      expect(comboboxes).toHaveLength(2)

      await userEvent.click(comboboxes[1])
      expect(await screen.findByRole("option", { name: "Views" })).toBeInTheDocument()
      await userEvent.click(screen.getByRole("option", { name: "Views" }))
      expect(onChange).toHaveBeenCalledWith({ op: "avg", column: "views" })
    })

    it("renders countWhere with column selector and match value text field", async () => {
      const onChange = vi.fn()
      const value: AggregateFormula = { op: "countWhere", column: "title", value: "x" }
      renderWithClient(<FormulaEditor seedSlug="posts" value={value} onChange={onChange} />)

      expect(screen.getByDisplayValue("x")).toBeInTheDocument()

      const textField = screen.getByDisplayValue("x")
      await userEvent.type(textField, "y")
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ op: "countWhere", column: "title" }),
      )
    })

    it("renders percentageOf with numerator and denominator selectors", async () => {
      const onChange = vi.fn()
      const value: AggregateFormula = { op: "percentageOf", numeratorColumn: "views", denominatorColumn: "likes" }
      renderWithClient(<FormulaEditor seedSlug="posts" value={value} onChange={onChange} />)

      expect(screen.getByText("Numerator column")).toBeInTheDocument()
      expect(screen.getByText("Denominator column")).toBeInTheDocument()

      const comboboxes = screen.getAllByRole("combobox")
      // First combobox is the op selector; second/third are numerator/denominator.
      await userEvent.click(comboboxes[2])
      const option = await screen.findByRole("option", { name: "Views" })
      await userEvent.click(option)
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ op: "percentageOf", denominatorColumn: "views" }),
      )
    })

    it("switching op to countWhere resets the formula shape", async () => {
      const onChange = vi.fn()
      renderWithClient(<FormulaEditor seedSlug="posts" value={{ op: "count" }} onChange={onChange} />)

      const trigger = screen.getByRole("combobox")
      await userEvent.click(trigger)
      const option = await screen.findByRole("option", { name: "Count where" })
      await userEvent.click(option)
      expect(onChange).toHaveBeenCalledWith({ op: "countWhere", column: "", value: "" })
    })

    it("switching op to percentageOf resets the formula shape", async () => {
      const onChange = vi.fn()
      renderWithClient(<FormulaEditor seedSlug="posts" value={{ op: "count" }} onChange={onChange} />)

      const trigger = screen.getByRole("combobox")
      await userEvent.click(trigger)
      const option = await screen.findByRole("option", { name: "Percentage of" })
      await userEvent.click(option)
      expect(onChange).toHaveBeenCalledWith({ op: "percentageOf", numeratorColumn: "", denominatorColumn: "" })
    })
  })
})
