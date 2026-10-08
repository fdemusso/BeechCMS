// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { FieldEdit } from "@/components/fields/FieldEdit"
import { TagChips } from "@/components/ui/tag-chips"
import { JsonEdit } from "@/components/fields/edit/json"
import type { Branch } from "@beechcms/core"

describe("Tags max-width and truncation (#301)", () => {
  const longTagText = "Restauro conservativo pietra a secco e ribattitura conci originali"

  const tagsBranch = {
    id: "br_tags",
    alias: "tags",
    label: "Tags Field",
    type: "tags",
    options: [longTagText, "normal-tag"],
    policies: [],
  } as unknown as Branch

  it("TagChips applica max-w-[260px], truncate e title con il testo completo", () => {
    render(<TagChips tags={[longTagText]} />)

    const span = screen.getByText(longTagText)
    expect(span).toHaveClass("truncate")
    expect(span).toHaveClass("max-w-[260px]")
    expect(span).toHaveClass("min-w-0")
    expect(span).toHaveAttribute("title", longTagText)

    const badge = span.closest(".max-w-full")
    expect(badge).toBeInTheDocument()
  })

  it("JsonEdit per type 'tags' tronca i tag lunghi e imposta max-width e title", () => {
    const initialValue = { [longTagText]: "#3b82f6" }
    const { container } = render(
      <JsonEdit branch={tagsBranch} value={initialValue} onChange={vi.fn()} />
    )

    const button = container.querySelector("button[title]")
    expect(button).toHaveAttribute("title", longTagText)
    expect(button).toHaveClass("max-w-full")

    const span = screen.getByText(longTagText)
    expect(span).toHaveClass("truncate")
    expect(span).toHaveClass("max-w-[260px]")
    expect(span).toHaveClass("min-w-0")
  })

  it("JsonEdit per type 'tags' non soccombe a chiavi con nomi di prototipo (constructor, toString)", () => {
    const onChange = vi.fn()
    // Obietto contenente sia chiavi lecite che proprietà ereditate dal prototype
    const mockValue = Object.assign(Object.create({ constructor: "exploited" }), {
      "Legitimate Tag": "#10b981",
    })

    render(
      <JsonEdit branch={tagsBranch} value={mockValue} onChange={onChange} />
    )

    expect(screen.getByText("Legitimate Tag")).toBeInTheDocument()
    expect(screen.queryByText("exploited")).not.toBeInTheDocument()
  })
})

describe("FieldEdit routing for tags with options", () => {
  const tierBranch = {
    id: "br_tier",
    alias: "tier",
    label: "Plan",
    type: "tags",
    options: ["free", "pro"],
  } as unknown as Branch

  it("mostra i tag salvati come chip e non usa il select a valore singolo", () => {
    render(<FieldEdit branch={tierBranch} value={["pro"]} onChange={vi.fn()} />)

    expect(screen.getByText("pro")).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("emette un array quando si rimuove un tag", () => {
    const onChange = vi.fn()
    render(<FieldEdit branch={tierBranch} value={["pro"]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText("Remove tag pro"))

    expect(onChange).toHaveBeenCalledWith([])
  })
})
