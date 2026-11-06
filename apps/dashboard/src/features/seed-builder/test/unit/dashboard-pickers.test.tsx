// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GroupPicker } from "../../components/GroupPicker"
import { ViewsPicker } from "../../components/ViewsPicker"

describe("GroupPicker", () => {
  function setup(value = "") {
    const onChange = vi.fn()
    render(<GroupPicker value={value} groups={["Sales", "Marketing"]} defaultLabel="Contents" onChange={onChange} />)
    return onChange
  }

  it("shows the default section until a group is chosen", () => {
    setup()

    expect(screen.getByRole("combobox")).toHaveTextContent("Contents")
  })

  it("picks one of the existing groups", async () => {
    const onChange = setup()
    await userEvent.click(screen.getByRole("combobox"))

    await userEvent.click(await screen.findByText("Marketing"))

    expect(onChange).toHaveBeenCalledWith("Marketing")
  })

  it("goes back to the default section with an empty group", async () => {
    const onChange = setup("Sales")
    await userEvent.click(screen.getByRole("combobox"))

    await userEvent.click(await screen.findByText("Contents"))

    expect(onChange).toHaveBeenCalledWith("")
  })

  it("offers to create a group that does not exist yet, and not one that does", async () => {
    const onChange = setup()
    await userEvent.click(screen.getByRole("combobox"))
    const search = await screen.findByPlaceholderText("Search or create a group…")

    await userEvent.type(search, "sales")
    expect(screen.queryByText(/Create/)).not.toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, "Support")
    await userEvent.click(await screen.findByText("Create “Support”"))

    expect(onChange).toHaveBeenCalledWith("Support")
  })
})

describe("ViewsPicker", () => {
  it("keeps the table on, lets the implemented views be toggled and disables the rest", () => {
    const onToggle = vi.fn()
    render(<ViewsPicker selected={["gallery"]} onToggle={onToggle} />)

    const table = screen.getByRole("checkbox", { name: "Table" })
    expect(table).toBeChecked()
    expect(table).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: "Gallery" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Kanban" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Calendar" })).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: "Chart" })).toBeDisabled()

    fireEvent.click(screen.getByRole("checkbox", { name: "Kanban" }))
    expect(onToggle).toHaveBeenCalledWith("kanban", true)
  })
})
