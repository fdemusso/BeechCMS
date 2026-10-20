// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FilterConditionInput } from "@/features/content-toolbar/toolbar-components/filter-condition-input"
import { ConditionalFormatsEditor } from "@/features/content-toolbar/toolbar-components/conditional-formats-editor"

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

  it("ColumnPicker selects the column and closes the menu", async () => {
    const addConditionalFormatRule = vi.fn()
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>host</DropdownMenuTrigger>
        <DropdownMenuContent>
          <ConditionalFormatsEditor
            enabled
            formattableColumns={[{ columnId: "status", label: "Status", type: "select" }]}
            conditionalFormats={[]}
            activeConditionalRule={null}
            isConditionalEditorOpen={false}
            setIsConditionalEditorOpen={vi.fn()}
            setActiveConditionalRuleId={vi.fn()}
            addConditionalFormatRule={addConditionalFormatRule}
            updateConditionalRule={vi.fn()}
            updateConditionalTextStyles={vi.fn()}
            removeConditionalRule={vi.fn()}
            moveConditionalRule={vi.fn()}
            updateConditionalCondition={vi.fn()}
            addConditionalCondition={vi.fn()}
            removeConditionalCondition={vi.fn()}
            availableTagsByColumnId={{}}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    await userEvent.click(screen.getAllByRole("button", { name: /add/i })[0])
    await userEvent.click(await screen.findByRole("menuitem", { name: /status/i }))

    expect(addConditionalFormatRule).toHaveBeenCalledWith("status")
    // The host menu stays open (it is controlled); only the picker menu must be gone.
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: /status/i })).toBeNull())
  })
})
