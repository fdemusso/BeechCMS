// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { TimezoneSelect } from "./timezone-select"

function renderSelect() {
  return render(
    <>
      <label htmlFor="tz">Timezone</label>
      <TimezoneSelect id="tz" value="Europe/Rome" onValueChange={() => {}} />
    </>,
  )
}

describe("TimezoneSelect", () => {
  it("is a labelled combobox that says it opens a list, and points at nothing while closed", () => {
    renderSelect()
    const trigger = screen.getByRole("combobox", { name: "Timezone" })
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(trigger).not.toHaveAttribute("aria-controls")
  })

  it("points at the list it opened, and scrolls it with the shadcn ScrollArea", () => {
    renderSelect()
    const trigger = screen.getByRole("combobox", { name: "Timezone" })

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute("aria-expanded", "true")
    const popover = document.getElementById(trigger.getAttribute("aria-controls")!)!
    expect(popover).toBeInTheDocument()
    expect(popover.querySelector('[data-slot="scroll-area"]')).not.toBeNull()
    expect(popover.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull()
    // No scroll of its own left on the list or its group.
    expect(popover.querySelector('[cmdk-group].overflow-y-auto, [cmdk-list].overflow-y-auto')).toBeNull()
  })
})
