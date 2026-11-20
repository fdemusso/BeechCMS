// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FilterConditionInput } from "@/features/content-toolbar/toolbar-components/filter-condition-input"
import { ConditionalColorsSubmenu } from "@/features/content-toolbar/toolbar-components/conditional-formats-editor"

describe("toolbar dropdowns close on selection", () => {
  it.each([
    ["select", "live"],
    ["tags", "blue"],
  ] as const)("FilterConditionInput (%s) selects the option and closes the menu", async (type, option) => {
    const onChange = vi.fn()
    render(
      <FilterConditionInput
        type={type}
        value={null}
        onChange={onChange}
        selectOptions={["draft", "live"]}
        availableTags={["red", "blue"]}
      />,
    )

    await userEvent.click(screen.getByRole("button"))
    await userEvent.click(await screen.findByRole("menuitem", { name: option }))

    expect(onChange).toHaveBeenCalledWith(option)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
  })

  it("Add rule submenu selects the column and closes the menu", async () => {
    const addConditionalFormatRule = vi.fn()
    const onClose = vi.fn()
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>host</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ConditionalColorsSubmenu
            enabled
            formattableColumns={[{ columnId: "status", label: "Status", type: "select" }]}
            conditionalFormats={[]}
            setActiveConditionalRuleId={vi.fn()}
            setIsConditionalEditorOpen={vi.fn()}
            addConditionalFormatRule={addConditionalFormatRule}
            onClose={onClose}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    await userEvent.click(screen.getByRole("menuitem", { name: /conditional colors/i }))
    await userEvent.click(await screen.findByRole("menuitem", { name: /add rule/i }))
    await userEvent.click(await screen.findByRole("menuitem", { name: /status/i }))

    expect(addConditionalFormatRule).toHaveBeenCalledWith("status")
    expect(onClose).toHaveBeenCalled()
  })
})
