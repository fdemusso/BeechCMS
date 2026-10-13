// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import { tagOptionsIssues, type Branch } from "@beechcms/core"
import { DEFAULT_TAG_OPTION_COLOR, TagOptionsForm } from "@/components/fields/edit/repeater/repeater-branch-options"
import { withoutIneligibleTagOptions } from "@/components/fields/edit/repeater/repeater-tag-options"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!
const priority = posts.branches.find((branch) => branch.alias === "priority") as Branch
const freeTags = posts.branches.find((branch) => branch.alias === "tags") as Branch

describe("TagOptionsForm", () => {
  let onChange: Mock<(updated: Branch) => void>

  beforeEach(() => {
    onChange = vi.fn<(updated: Branch) => void>()
  })

  it("su priority, spuntare \"Multiple values\" emette il branch senza la chiave multiple", () => {
    render(<TagOptionsForm branch={priority} onChange={onChange} />)

    fireEvent.click(screen.getByRole("checkbox", { name: "Multiple values" }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("multiple")
  })

  it("su posts.tags, togliere la spunta emette multiple: false", () => {
    render(<TagOptionsForm branch={freeTags} onChange={onChange} />)

    fireEvent.click(screen.getByRole("checkbox", { name: "Multiple values" }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ multiple: false }))
  })

  it("\"Add option\" su posts.tags emette options con una riga { value: \"\", color: preset }", () => {
    render(<TagOptionsForm branch={freeTags} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Add option" }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ options: [{ value: "", color: DEFAULT_TAG_OPTION_COLOR }] }),
    )
    expect(DEFAULT_TAG_OPTION_COLOR).toBe("#64748b")
  })

  it("\"Move down\" sulla prima riga di priority emette le opzioni in ordine high, low; \"Move up\" della prima riga è disabilitato", () => {
    render(<TagOptionsForm branch={priority} onChange={onChange} />)

    const [firstMoveUp] = screen.getAllByRole("button", { name: "Move up" })
    const [firstMoveDown] = screen.getAllByRole("button", { name: "Move down" })
    fireEvent.click(firstMoveDown)

    expect(firstMoveUp).toBeDisabled()
    const emitted = onChange.mock.calls[0][0] as Branch
    expect(emitted.options?.map((option) => option.value)).toEqual(["high", "low"])
  })

  it("rimuovere l'unica opzione emette un branch senza la chiave options", () => {
    const onlyLow: Branch = { ...priority, options: [priority.options![0]] }
    render(<TagOptionsForm branch={onlyLow} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Remove option" }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("options")
  })

  it("cambiare il colore di una riga emette quel colore sulla sola riga toccata", () => {
    render(<TagOptionsForm branch={priority} onChange={onChange} />)

    const [, highColor] = screen.getAllByLabelText("Color")
    fireEvent.change(highColor, { target: { value: "#00ff00" } })

    const emitted = onChange.mock.calls[0][0] as Branch
    expect(emitted.options).toEqual([
      { value: "low", color: "#64748b" },
      { value: "high", color: "#00ff00" },
    ])
  })

  it("un branch con valore duplicato e colore red mostra i messaggi di tagOptionsIssues", () => {
    const malformed = {
      ...priority,
      options: [
        { value: "low", color: "red" },
        { value: "low", color: "#64748b" },
      ],
    } as Branch
    const expectedIssues = tagOptionsIssues(malformed)

    render(<TagOptionsForm branch={malformed} onChange={onChange} />)

    expect(expectedIssues.length).toBeGreaterThan(0)
    expect(screen.getAllByRole("listitem")).toHaveLength(expectedIssues.length)
  })
})

describe("withoutIneligibleTagOptions", () => {
  it("toglie options da un branch text", () => {
    const textWithOptions = { id: "br_01", alias: "title", label: "Title", type: "text", options: priority.options } as Branch

    const result = withoutIneligibleTagOptions(textWithOptions)

    expect(result).not.toHaveProperty("options")
  })

  it("restituisce lo stesso oggetto per priority", () => {
    const result = withoutIneligibleTagOptions(priority)

    expect(result).toBe(priority)
  })

  it("lascia multiple su un branch file", () => {
    const fileBranch = { id: "br_06", alias: "image", label: "Image", type: "file", multiple: true, options: priority.options } as Branch

    const result = withoutIneligibleTagOptions(fileBranch)

    expect(result.multiple).toBe(true)
    expect(result).not.toHaveProperty("options")
  })
})
