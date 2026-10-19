// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"
import type { ViewEntryActions, ViewLayout, ViewQueryState, ViewRendererProps } from "@/features/shared"
import { NO_ELEMENT_FORMATTER } from "@/lib/conditional-format"

vi.mock("@/lib/content-api", () => ({
  fetchKanbanColumn: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 25 })),
  moveKanbanCard: vi.fn(),
}))

vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, effective: {} }),
}))

vi.mock("@/features/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/shared")>()
  return {
    ...actual,
    useLocalizeEntryData: () => (_seed: unknown, data: Record<string, unknown>) => data,
  }
})

import { fetchKanbanColumn } from "@/lib/content-api"
import { KanbanViewRenderer } from "../../components/kanban-view-renderer"

// Canonical posts has allowDrafts: true, which is kanban-incompatible: ContentKanban renders its
// notice and fetches nothing, so the renderer can be exercised without a live column query.
const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!

const requiredAxisPosts: Seed = {
  ...posts,
  allowDrafts: false,
  branches: posts.branches.map((branch) =>
    branch.id === "br_11" ? { ...branch, requiredOnUpdate: true } : branch
  ),
}

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
    columnOrder: [],
    setColumnOrder: vi.fn(),
    density: "normal",
    setDensity: vi.fn(),
    conditionalFormats: [],
    setConditionalFormats: vi.fn(),
    folders: undefined,
    setFolders: vi.fn(),
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
  beforeEach(() => vi.clearAllMocks())

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

  it("propagates activeFilters mapped from query.columnFilters to column queries", () => {
    const props = makeProps({
      seed: requiredAxisPosts,
      layout: makeLayout({ kanban: { axisBranchId: "br_11", sort: null } }),
      query: makeQuery({
        columnFilters: [
          {
            id: "status",
            value: {
              columnId: "status",
              type: "select",
              conditions: [{ id: "c1", op: "eq", value: "published" }],
            },
          },
        ],
      }),
    })

    renderWithClient(props)

    expect(fetchKanbanColumn).toHaveBeenCalledWith(
      "posts",
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({
            column: "status",
            type: "select",
            conditions: expect.arrayContaining([{ op: "eq", value: "published" }]),
          }),
        ]),
      })
    )
  })
})

