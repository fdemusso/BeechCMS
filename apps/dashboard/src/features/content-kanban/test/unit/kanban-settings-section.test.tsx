// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

// DropdownMenuSub/SubContent only mount on real hover in Radix; flattened here so a Kanban
// settings section's submenu items are directly queryable, the same idiom builder-pane.test.tsx uses.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <div role="menuitem" onClick={() => onSelect?.()}>{children}</div>
  ),
}))

import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"
import type { ViewLayout } from "@/features/shared"
import { KanbanSettingsSection } from "../../components/kanban-settings-section"

// Drafts make a seed kanban-incompatible; with them off, "tags" (br_07) is the only axis candidate.
const posts: Seed = { ...CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!, allowDrafts: false }

function makeLayout(overrides: Partial<ViewLayout> = {}): ViewLayout {
  return {
    groupBy: null,
    setGroupBy: vi.fn(),
    dateGroupPrecision: { year: true, month: true, day: false },
    setDateGroupPrecision: vi.fn(),
    columnVisibility: {},
    setColumnVisibility: vi.fn(),
    density: "normal",
    setDensity: vi.fn(),
    conditionalFormats: [],
    setConditionalFormats: vi.fn(),
    kanban: { axisBranchId: null, sort: null },
    setKanban: vi.fn(),
    card: undefined,
    setCard: vi.fn(),
    ...overrides,
  }
}

function renderSection(seed: Seed, layout: ViewLayout, onClose = vi.fn(), onOpenConfigDialog = vi.fn()) {
  render(
    <KanbanSettingsSection seed={seed} layout={layout} onClose={onClose} onOpenConfigDialog={onOpenConfigDialog} />
  )
  return { onClose, onOpenConfigDialog }
}

describe("KanbanSettingsSection", () => {
  it("lists the seed's axis candidates under group-by", () => {
    renderSection(posts, makeLayout())

    expect(screen.getByText("Tags")).toBeInTheDocument()
  })

  it("picking Tags sets the axis and closes the menu", () => {
    const setKanban = vi.fn()
    const { onClose } = renderSection(posts, makeLayout({ setKanban }))

    screen.getByText("Tags").click()

    expect(setKanban).toHaveBeenCalledWith({
      axisBranchId: "br_07",
      sort: null,
      hiddenColumnValues: [],
      collapsedColumnValues: [],
    })
    expect(onClose).toHaveBeenCalled()
  })

  it("renders nothing for canonical posts as-is, since drafts leave it kanban-incompatible", () => {
    const original = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!

    const { container } = render(
      <KanbanSettingsSection seed={original} layout={makeLayout()} onClose={vi.fn()} onOpenConfigDialog={vi.fn()} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("Configure card layout opens the dialog and closes the menu", () => {
    const { onClose, onOpenConfigDialog } = renderSection(posts, makeLayout())

    screen.getByText("Configure card layout").click()

    expect(onOpenConfigDialog).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
