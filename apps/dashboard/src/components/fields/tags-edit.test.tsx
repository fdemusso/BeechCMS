// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Branch } from "@beechcms/core"

import { TagsEdit } from "@/components/fields/edit/tags"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!
const single = posts.branches.find((branch) => branch.alias === "priority") as Branch
const freeTags = posts.branches.find((branch) => branch.alias === "tags") as Branch
// No canonical branch is multiple-choice with options (Rule 6.2.1): derive it from priority.
const { multiple: _singleMode, ...multipleFields } = single
const multiple = multipleFields as Branch

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Choose a value" }))
}

describe("TagsEdit", () => {
  let onChange: Mock<(value: unknown) => void>

  beforeEach(() => {
    onChange = vi.fn<(value: unknown) => void>()
  })

  it("singola: scegliere high dal menu con valore [] emette [\"high\"]", () => {
    render(<TagsEdit branch={single} value={[]} onChange={onChange} />)

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "high" }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(["high"])
  })

  it("singola: scegliere high con valore [\"low\"] emette [\"high\"] (sostituzione)", () => {
    render(<TagsEdit branch={single} value={["low"]} onChange={onChange} />)

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "high" }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(["high"])
  })

  it("singola: scegliere l'opzione già selezionata non emette nulla", () => {
    render(<TagsEdit branch={single} value={["low"]} onChange={onChange} />)

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "low" }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it("multipla: scegliere high con valore [\"low\"] emette [\"low\", \"high\"]", () => {
    render(<TagsEdit branch={multiple} value={["low"]} onChange={onChange} />)

    openMenu()
    fireEvent.click(screen.getByRole("button", { name: "high" }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(["low", "high"])
  })

  it("cliccare il chip low emette []", () => {
    render(<TagsEdit branch={single} value={["low"]} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Remove low" }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith([])
  })

  it("ogni voce del menu mostra un pallino col colore dichiarato dell'opzione, nell'ordine dichiarato", () => {
    render(<TagsEdit branch={single} value={[]} onChange={onChange} />)

    openMenu()
    const dots = screen.getAllByTestId("tag-option-dot")

    expect(dots.map((dot) => dot.style.backgroundColor)).toEqual(["#64748b", "#ef4444"])
    expect(dots.map((dot) => dot.parentElement?.getAttribute("title"))).toEqual(["low", "high"])
  })

  it("il chip di un valore selezionato ha come sfondo il colore dichiarato", () => {
    render(<TagsEdit branch={single} value={["high"]} onChange={onChange} />)

    const chip = within(screen.getByRole("button", { name: "Remove high" })).getByText("high").closest("[data-slot='badge']") as HTMLElement

    expect(chip.style.backgroundColor).toBe("#ef4444")
  })

  it("un valore salvato fuori elenco appare come chip \"not in the options\" e non compare nel menu", () => {
    render(<TagsEdit branch={single} value={["gone"]} onChange={onChange} />)

    const obsoleteChip = screen.getByLabelText("gone — not in the options")
    openMenu()

    expect(obsoleteChip).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "gone" })).not.toBeInTheDocument()
  })

  it("readOnly: nessun trigger \"Choose a value\"; il click sul chip non emette", () => {
    render(<TagsEdit branch={single} value={["low"]} onChange={onChange} readOnly />)

    fireEvent.click(screen.getByRole("button", { name: "Remove low" }))

    expect(screen.queryByRole("button", { name: "Choose a value" })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("posts.tags (senza opzioni) rende il code editor JSON", async () => {
    render(<TagsEdit branch={freeTags} value={["react"]} onChange={onChange} />)

    const editor = await screen.findByTestId("json-code-editor")

    expect(editor).toBeInTheDocument()
  })
})
