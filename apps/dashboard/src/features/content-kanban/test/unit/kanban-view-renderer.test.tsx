// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { ViewEntryActions, ViewLayout, ViewQueryState, ViewRendererProps } from "@/features/shared"
import { NO_ELEMENT_FORMATTER } from "@/lib/conditional-format"
import { KanbanViewRenderer } from "../../components/kanban-view-renderer"

vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, effective: {} }),
}))

// Canonical posts has allowDrafts: true, which is kanban-incompatible: ContentKanban renders its
// notice and fetches nothing, so the renderer can be exercised without a live column query.
const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!

function makeQuery(overrides: Partial<ViewQueryState> = {}): ViewQueryState {
  return {
    data: [],
    isLoading: false,
    totalRows: 0,
    pageIndex: 0,
    setPageIndex: vi.fn(),
    pageSize: 25,
    handlePageSizeChange: vi.fn(),
    pageCount: 0,
    tableSearch: "",
    setTableSearch: vi.fn(),
    debouncedSearch: "",
    sorting: [],
    handleTableSortingChange: vi.fn(),
    columnFilters: [],
    isEmptySeed: false,
    applyCellFilter: vi.fn(),
    ...overrides,
  }
}

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

function makeEntries(overrides: Partial<ViewEntryActions> = {}): ViewEntryActions {
  return {
    handleEdit: vi.fn(),
    handleCreate: vi.fn(),
    handleDelete: vi.fn(),
    handleBulkDelete: vi.fn(),
    handleBulkEdit: vi.fn(),
    rowSelection: {},
    setRowSelection: vi.fn(),
    selectedIds: [],
    subscribeSaved: vi.fn(() => vi.fn()),
    ...overrides,
  }
}

function renderWithClient(props: ViewRendererProps) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanViewRenderer {...props} />
    </QueryClientProvider>
  )
}

function makeProps(overrides: Partial<ViewRendererProps> = {}): ViewRendererProps {
  return {
    seed: posts,
    slug: "posts",
    query: makeQuery(),
    layout: makeLayout(),
    formatElement: NO_ELEMENT_FORMATTER,
    entries: makeEntries(),
    isSaving: false,
    configDialog: { open: false, onOpenChange: vi.fn() },
    ...overrides,
  }
}

describe("KanbanViewRenderer", () => {
  it("with configDialog.open true, renders the card-layout dialog; closing it calls configDialog.onOpenChange(false)", () => {
    const onOpenChange = vi.fn()
    renderWithClient(makeProps({ configDialog: { open: true, onOpenChange } }))

    expect(screen.getByText("Card layout")).toBeInTheDocument()

    screen.getByRole("button", { name: "Close" }).click()

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("subscribes exactly one saved-listener on mount, across re-renders", () => {
    const subscribeSaved = vi.fn(() => vi.fn())
    const props = makeProps({ entries: makeEntries({ subscribeSaved }) })
    const queryClient = new QueryClient()
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <KanbanViewRenderer {...props} />
      </QueryClientProvider>
    )

    rerender(
      <QueryClientProvider client={queryClient}>
        <KanbanViewRenderer {...props} isSaving />
      </QueryClientProvider>
    )

    expect(subscribeSaved).toHaveBeenCalledTimes(1)
  })

  it("unmounting calls the unsubscribe that subscribeSaved returned", () => {
    const unsubscribe = vi.fn()
    const subscribeSaved = vi.fn(() => unsubscribe)
    const { unmount } = renderWithClient(makeProps({ entries: makeEntries({ subscribeSaved }) }))

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})
