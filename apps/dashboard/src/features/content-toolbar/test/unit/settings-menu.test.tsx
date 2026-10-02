// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { SettingsMenu } from "@/features/content-toolbar/toolbar-components/settings-menu"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSettingsMenu(activeViewId: string) {
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
        closeSettingsMenu={vi.fn()}
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
        activeViewId={activeViewId}
      />
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsMenu", () => {
  it("in vista tabella mostra i controlli strettamente tabellari (colori condizionali, colonne visibili)", () => {
    renderSettingsMenu("table")

    expect(screen.getByText("Conditional colors")).toBeInTheDocument()
    expect(screen.getByText("Visible columns")).toBeInTheDocument()
    expect(screen.getByText("Table")).toBeInTheDocument()
    expect(screen.queryByText("Display")).not.toBeInTheDocument()
  })

  it("in vista gallery nasconde i controlli tabellari ma mantiene raggruppamento, righe e densità", () => {
    renderSettingsMenu("gallery")

    expect(screen.queryByText("Conditional colors")).not.toBeInTheDocument()
    expect(screen.queryByText("Visible columns")).not.toBeInTheDocument()
    expect(screen.queryByText("Table")).not.toBeInTheDocument()

    expect(screen.getByText("Display")).toBeInTheDocument()
    expect(screen.getByText("Group")).toBeInTheDocument()
    expect(screen.getByText("Rows")).toBeInTheDocument()
    expect(screen.getByText("Density")).toBeInTheDocument()
  })

  it("in vista kanban non mostra né i controlli tabellari né quelli non-kanban (ha la sua sezione dedicata)", () => {
    renderSettingsMenu("kanban")

    expect(screen.queryByText("Conditional colors")).not.toBeInTheDocument()
    expect(screen.queryByText("Visible columns")).not.toBeInTheDocument()
    expect(screen.queryByText("Table")).not.toBeInTheDocument()
    expect(screen.queryByText("Display")).not.toBeInTheDocument()
  })
})
