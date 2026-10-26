// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/content-api", () => ({
  fetchKanbanColumn: vi.fn(),
  moveKanbanCard: vi.fn(),
}))

vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, effective: {} }),
}))

vi.mock("@/features/shared", () => ({
  useLocalizeEntryData: () => (_seed: unknown, data: Record<string, unknown>) => data,
}))

import { fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { FilterGroup, Seed } from "@beechcms/core"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import { fetchKanbanColumn, type ContentListWithMeta } from "@/lib/content-api"
import { ContentKanban } from "../../components/content-kanban"

// Canonical posts allows drafts, which is kanban-incompatible; the axis is its `priority` (br_11), made required.
const canonicalPosts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts")!
const requiredAxisPosts: Seed = {
  ...canonicalPosts,
  allowDrafts: false,
  branches: canonicalPosts.branches.map((branch) => (branch.id === "br_11" ? { ...branch, requiredOnUpdate: true } : branch)),
}

const OBSOLETE_ENTRY = { id: "0b0e8400-e29b-41d4-a716-446655440000", slug: "obsolete", status: "published", data: { title: "Obsolete", priority: ["urgent"] } }

/** Answers each column query; the null column (the only one filtered with `not_in`) holds `nullColumnItems`. */
function serveColumns(nullColumnItems: unknown[]) {
  vi.mocked(fetchKanbanColumn).mockImplementation(async (_slug, params) => {
    const columnFilter = (params.filters as FilterGroup[])[0]
    const items = columnFilter.conditions[0].op === "not_in" ? nullColumnItems : []
    return { items, total: items.length, page: 1, limit: 25 } as ContentListWithMeta
  })
}

function renderBoard(setKanbanConfig = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ContentKanban
        seed={requiredAxisPosts}
        seedSlug="posts"
        onEdit={vi.fn()}
        onCreateEntry={vi.fn()}
        kanbanConfig={{ axisBranchId: "br_11", sort: null }}
        setKanbanConfig={setKanbanConfig}
      />
    </QueryClientProvider>
  )
}

describe("ContentKanban", () => {
  beforeEach(() => vi.clearAllMocks())

  it("hides the fallback column of a required axis while no entry needs it", async () => {
    serveColumns([])

    renderBoard()

    expect(await screen.findByRole("region", { name: "high — 0 voci" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "low — 0 voci" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /^Senza Priority/ })).not.toBeInTheDocument()
  })

  // Regression guard: on a required axis an entry whose value was removed from the options
  // matched no column and vanished from the board.
  it("shows the fallback column holding an entry with an obsolete value, without a create action", async () => {
    serveColumns([OBSOLETE_ENTRY])

    renderBoard()

    expect(await screen.findByRole("region", { name: "Senza Priority — 1 voci" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Nuova voce in Senza Priority" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Nuova voce in high" })).toBeInTheDocument()
  })

  it("persists a collapsed column through setKanbanConfig", async () => {
    serveColumns([])
    const setKanbanConfig = vi.fn()
    renderBoard(setKanbanConfig)
    const column = await screen.findByRole("region", { name: "high — 0 voci" })

    fireEvent.click(within(column).getByRole("button", { expanded: true }))

    expect(setKanbanConfig).toHaveBeenCalledWith(expect.objectContaining({ axisBranchId: "br_11", collapsedColumnValues: ["high"] }))
  })
})
