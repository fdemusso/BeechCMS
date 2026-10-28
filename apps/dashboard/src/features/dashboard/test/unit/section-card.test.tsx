// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import type React from "react"
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import type { DashboardSection } from "@beechcms/core"
import "@/features/dashboard/registry/builtin-widgets"
import { SectionCard } from "@/features/dashboard/builder/section-card"
import type { UseDashboardBuilderResult } from "@/features/dashboard/builder"

// Radix DropdownMenu relies on pointer-event timing that jsdom doesn't replicate well; render a plain,
// always-open menu instead so item callbacks (onSelect) can be exercised directly via click.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    className,
  }: {
    children: React.ReactNode
    onSelect?: (event: { preventDefault: () => void }) => void
    disabled?: boolean
    className?: string
  }) => (
    <div
      role="menuitem"
      aria-disabled={disabled || undefined}
      className={className}
      onClick={() => { if (!disabled) onSelect?.({ preventDefault: () => {} }) }}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(cleanup)

function makeSection(overrides: Partial<DashboardSection> = {}): DashboardSection {
  return {
    id: "section-1",
    columns: [
      { id: "col-1", widgets: [{ id: "w1", type: "core/text", config: {} }] },
      { id: "col-2", widgets: [] },
    ],
    columnSpans: [6, 6],
    ...overrides,
  }
}

function makeOps() {
  return {
    updateSection: vi.fn(),
    toggleSectionFlag: vi.fn(),
    setColumnPreset: vi.fn(),
    duplicateSection: vi.fn(),
    removeSection: vi.fn(),
    addWidget: vi.fn(() => true),
    removeWidget: vi.fn(),
    updateWidgetTitle: vi.fn(),
    duplicateWidget: vi.fn(() => true),
    replaceWidget: vi.fn(),
    moveWidgetToPage: vi.fn(() => true),
  }
}

function renderCard(section: DashboardSection, extra: { canRemove?: boolean } = {}) {
  const ops = makeOps()
  const onConfigureWidget = vi.fn()

  render(
    <DndContext>
      <SectionCard
        pageId="page-1"
        section={section}
        otherPages={[]}
        ops={ops as unknown as UseDashboardBuilderResult}
        canRemove={extra.canRemove ?? true}
        onConfigureWidget={onConfigureWidget}
      />
    </DndContext>,
  )

  return { ops, onConfigureWidget }
}

const menuItem = (name: RegExp | string) => screen.getByRole("menuitem", { name })

describe("SectionCard", () => {
  it("renders the section label when set", () => {
    renderCard(makeSection({ label: "My Section" }))

    expect(screen.getByText("My Section")).toBeInTheDocument()
  })

  it("renders a placeholder when the section has no label", () => {
    renderCard(makeSection())

    expect(screen.getByText("No Label")).toBeInTheDocument()
  })

  it("counts the section's widgets in a badge", () => {
    renderCard(makeSection())

    expect(screen.getByText("1 widget")).toBeInTheDocument()
  })

  it("renames on double click and commits with Enter", async () => {
    const { ops } = renderCard(makeSection({ label: "Old" }))

    await userEvent.dblClick(screen.getByText("Old"))
    const input = screen.getByDisplayValue("Old")
    await userEvent.clear(input)
    await userEvent.type(input, "New{Enter}")

    expect(ops.updateSection).toHaveBeenCalledWith("page-1", "section-1", { label: "New" })
  })

  it("commits an empty rename as no label", async () => {
    const { ops } = renderCard(makeSection({ label: "Old" }))

    await userEvent.dblClick(screen.getByText("Old"))
    await userEvent.clear(screen.getByDisplayValue("Old"))
    await userEvent.keyboard("{Enter}")

    expect(ops.updateSection).toHaveBeenCalledWith("page-1", "section-1", { label: undefined })
  })

  it("limits the rename input to the section label maximum", async () => {
    renderCard(makeSection({ label: "Old" }))

    await userEvent.dblClick(screen.getByText("Old"))

    expect(screen.getByDisplayValue("Old")).toHaveAttribute("maxlength", "60")
  })

  it.each([
    ["Hide Label", "hideLabel"],
    ["Collapsible", "collapsible"],
  ])("toggles %s from the menu", async (label, flag) => {
    const { ops } = renderCard(makeSection())

    await userEvent.click(menuItem(label))

    expect(ops.toggleSectionFlag).toHaveBeenCalledWith("page-1", "section-1", flag)
  })

  it("sets a column preset from the menu", async () => {
    const { ops } = renderCard(makeSection())
    const preset = document.querySelector("[data-spans='8,4']")?.closest("[role='menuitem']") as HTMLElement

    await userEvent.click(preset)

    expect(ops.setColumnPreset).toHaveBeenCalledWith("page-1", "section-1", [8, 4])
  })

  it("duplicates the section from the menu", async () => {
    const { ops } = renderCard(makeSection())

    await userEvent.click(menuItem("Duplicate"))

    expect(ops.duplicateSection).toHaveBeenCalledWith("page-1", "section-1")
  })

  it("removes a section with no widgets at once, without asking", async () => {
    const { ops } = renderCard(makeSection({ columns: [{ id: "col-1", widgets: [] }], columnSpans: [12] }))

    await userEvent.click(menuItem("Remove"))

    expect(ops.removeSection).toHaveBeenCalledWith("page-1", "section-1")
  })

  it("asks before removing a section that holds widgets, and removes on confirm", async () => {
    const { ops } = renderCard(makeSection())

    await userEvent.click(menuItem("Remove"))
    expect(ops.removeSection).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }))

    expect(ops.removeSection).toHaveBeenCalledWith("page-1", "section-1")
  })

  it("keeps the Remove item but disables it on a page's only section", async () => {
    const { ops } = renderCard(makeSection(), { canRemove: false })

    await userEvent.click(menuItem("Remove"))

    expect(menuItem("Remove")).toHaveAttribute("aria-disabled", "true")
    expect(ops.removeSection).not.toHaveBeenCalled()
  })

  it("lays the columns out on the 12-unit grid using their spans", () => {
    const { container } = render(
      <DndContext>
        <SectionCard
          pageId="page-1"
          section={makeSection({ columnSpans: [8, 4] })}
          otherPages={[]}
          ops={makeOps() as unknown as UseDashboardBuilderResult}
          canRemove
          onConfigureWidget={vi.fn()}
        />
      </DndContext>,
    )

    const spans = Array.from(container.querySelectorAll<HTMLElement>("[style*='grid-column']")).map((el) => el.style.gridColumn)
    expect(spans).toEqual(["span 8 / span 8", "span 4 / span 4"])
  })

  it("adds a widget to the column whose button was used", async () => {
    const { ops } = renderCard(makeSection())
    const secondColumnAdd = screen.getAllByRole("button", { name: /Add Widget/i })[1]

    await userEvent.click(secondColumnAdd)
    fireEvent.click(within(document.body).getAllByRole("option", { name: "Text" })[1])

    expect(ops.addWidget).toHaveBeenCalledWith("page-1", "section-1", "col-2", "core/text")
  })
})
