// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { SettingsMenu } from "@/features/content-toolbar/toolbar-components/settings-menu"
import type { ViewSetting } from "@/features/shared"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSettingsMenu(
  settings: readonly ViewSetting[],
  overrides: {
    showSort?: boolean
    renderSettingsSection?: (ctx: { close: () => void }) => React.ReactNode
    closeSettingsMenu?: () => void
    onDeleteView?: () => void
    canDeleteView?: boolean
  } = {}
) {
  return render(
    <TooltipProvider>
      <SettingsMenu
        isSettingsMenuOpenEffective
        setIsSettingsMenuOpenState={vi.fn()}
        commitViewName={vi.fn()}
        setColumnSearchTerm={vi.fn()}
        viewNameDraft="Vista di prova"
        setViewNameDraft={vi.fn()}
        setIsConditionalEditorOpen={vi.fn()}
        filterColumnSearchTerm=""
        setFilterColumnSearchTerm={vi.fn()}
        visibleFilterColumns={[]}
        addConditionToColumn={vi.fn()}
        setOpenPillId={vi.fn()}
        closeSettingsMenu={overrides.closeSettingsMenu ?? vi.fn()}
        filters={{}}
        sortColumnSearchTerm=""
        setSortColumnSearchTerm={vi.fn()}
        handleToggleSortDirection={vi.fn()}
        filteredSortableColumns={[]}
        handleSortColumnSelect={vi.fn()}
        groupBy={null}
        onGroupByChange={vi.fn()}
        recommendedGroupColumns={[]}
        datePrecisionMode="monthYear"
        applyDatePrecisionMode={vi.fn()}
        otherGroupColumns={[]}
        onConditionalFormatsChange={vi.fn()}
        formattableColumns={[]}
        conditionalFormats={[]}
        activeConditionalRule={null}
        isConditionalEditorOpen={false}
        setActiveConditionalRuleId={vi.fn()}
        addConditionalFormatRule={vi.fn()}
        updateConditionalRule={vi.fn()}
        updateConditionalTextStyles={vi.fn()}
        removeConditionalRule={vi.fn()}
        moveConditionalRule={vi.fn()}
        updateConditionalCondition={vi.fn()}
        addConditionalCondition={vi.fn()}
        removeConditionalCondition={vi.fn()}
        availableTagsByColumnId={{}}
        columnVisibility={{}}
        onColumnVisibilityChange={vi.fn()}
        columnSearchTerm=""
        filteredTableColumns={[]}
        pageSize={25}
        onPageSizeChange={vi.fn()}
        density="normal"
        onDensityChange={vi.fn()}
        settings={settings}
        showSort={overrides.showSort ?? true}
        renderSettingsSection={overrides.renderSettingsSection}
        onDeleteView={overrides.onDeleteView}
        canDeleteView={overrides.canDeleteView}
      />
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsMenu", () => {
  it("with all five settings, shows Group, Conditional colors, Visible columns, Rows and Density under Display", () => {
    renderSettingsMenu(["groupBy", "conditionalFormats", "columns", "pageSize", "density"])

    expect(screen.getByText("Group")).toBeInTheDocument()
    expect(screen.getByText("Conditional colors")).toBeInTheDocument()
    expect(screen.getByText("Display")).toBeInTheDocument()
    expect(screen.getByText("Visible columns")).toBeInTheDocument()
    expect(screen.getByText("Rows")).toBeInTheDocument()
    expect(screen.getByText("Density")).toBeInTheDocument()
  })

  it("with groupBy and pageSize only, hides conditional colors, visible columns and density, keeps Group and Rows", () => {
    renderSettingsMenu(["groupBy", "pageSize"])

    expect(screen.getByText("Group")).toBeInTheDocument()
    expect(screen.getByText("Rows")).toBeInTheDocument()
    expect(screen.queryByText("Conditional colors")).not.toBeInTheDocument()
    expect(screen.queryByText("Visible columns")).not.toBeInTheDocument()
    expect(screen.queryByText("Density")).not.toBeInTheDocument()
  })

  it("with no settings and no section, shows neither Layout & style nor Display", () => {
    renderSettingsMenu([])

    expect(screen.queryByText("Layout & style")).not.toBeInTheDocument()
    expect(screen.queryByText("Display")).not.toBeInTheDocument()
  })

  it("renders the node returned by renderSettingsSection, whose close calls closeSettingsMenu", () => {
    const closeSettingsMenu = vi.fn()
    renderSettingsMenu([], {
      closeSettingsMenu,
      renderSettingsSection: ({ close }) => <button onClick={close}>Section action</button>,
    })

    screen.getByText("Section action").click()

    expect(closeSettingsMenu).toHaveBeenCalled()
  })

  it("hides the Sort submenu when showSort is false", () => {
    renderSettingsMenu(["groupBy"], { showSort: false })

    expect(screen.queryByText("Sort")).not.toBeInTheDocument()
  })

  it("offers no delete item when the caller passes no onDeleteView", () => {
    renderSettingsMenu([])

    expect(screen.queryByRole("menuitem", { name: /delete view|elimina vista/i })).toBeNull()
  })

  it("disables the delete item for the content type's only Table view", () => {
    renderSettingsMenu([], { onDeleteView: vi.fn(), canDeleteView: false })

    const deleteItem = screen.getByRole("menuitem", { name: /delete view|elimina vista/i })
    expect(deleteItem).toHaveAttribute("data-disabled")
  })

  it("never renders two adjacent separators when a settings section and delete are both present", () => {
    renderSettingsMenu([], {
      onDeleteView: vi.fn(),
      canDeleteView: true,
      renderSettingsSection: () => <button>Section action</button>,
    })

    const separators = screen.getAllByRole("separator")
    for (const separator of separators) {
      expect(separator.nextElementSibling).not.toHaveAttribute("data-slot", "dropdown-menu-separator")
    }
  })

  it("never renders two adjacent separators when a wired settings section renders nothing and delete is present", () => {
    // Regression: a kanban-compatible seed with no axis candidate yet (the canonical `posts`
    // fixture) wires renderSettingsSection but it returns null, same as KanbanSettingsSection.
    renderSettingsMenu([], {
      onDeleteView: vi.fn(),
      canDeleteView: true,
      renderSettingsSection: () => null,
    })

    const separators = screen.getAllByRole("separator")
    for (const separator of separators) {
      expect(separator.nextElementSibling).not.toHaveAttribute("data-slot", "dropdown-menu-separator")
    }
  })
})
