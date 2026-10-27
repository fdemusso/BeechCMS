// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { CANONICAL_ENTRIES, CANONICAL_SEEDS } from "@beechcms/testing"
import type { ViewEntryActions, ViewLayout, ViewQueryState, ViewRendererProps } from "@/features/shared"
import { NO_ELEMENT_FORMATTER } from "@/lib/conditional-format"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { GalleryViewRenderer } from "../../gallery-view-renderer"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!

// Production mints entry ids server-side (idGenerator.uuid()); this literal only
// stands in for that shape.
const entry: ContentEntry = {
  id: "0f6a6f3e-2f8a-4e3a-9c3a-5f6b7c8d9e0f",
  slug: "canonical-post",
  status: "published",
  data: CANONICAL_ENTRIES[0].data,
  created_at: null,
  updated_at: null,
}

function makeQuery(overrides: Partial<ViewQueryState> = {}): ViewQueryState {
  return {
    data: [entry],
    isLoading: false,
    totalRows: 1,
    pageIndex: 0,
    setPageIndex: vi.fn(),
    pageSize: 25,
    handlePageSizeChange: vi.fn(),
    pageCount: 1,
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

describe("GalleryViewRenderer", () => {
  it("clicking a card calls entries.handleEdit with that entry id and renders no dialog of its own", () => {
    const handleEdit = vi.fn()
    const props = makeProps({ entries: makeEntries({ handleEdit }) })

    render(
      <MemoryRouter>
        <GalleryViewRenderer {...props} />
      </MemoryRouter>
    )

    screen.getByRole("button", { name: "Open detail: Canonical Post" }).click()

    expect(handleEdit).toHaveBeenCalledTimes(1)
    expect(handleEdit).toHaveBeenCalledWith(entry.id)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  // Regression guard for #748: GalleryViewRenderer must wire query.pageIndex/pageCount/
  // setPageIndex through to the gallery, otherwise entries past the fetched page are
  // never reachable from this view.
  it("wires query.pageIndex/pageCount/setPageIndex so Next advances the server page", () => {
    const setPageIndex = vi.fn()
    const props = makeProps({ query: makeQuery({ pageIndex: 1, pageCount: 3, setPageIndex }) })

    render(
      <MemoryRouter>
        <GalleryViewRenderer {...props} />
      </MemoryRouter>
    )

    screen.getByRole("link", { name: /Go to next page/i }).click()

    expect(setPageIndex).toHaveBeenCalledTimes(1)
    expect(setPageIndex).toHaveBeenCalledWith(2)
  })
})
