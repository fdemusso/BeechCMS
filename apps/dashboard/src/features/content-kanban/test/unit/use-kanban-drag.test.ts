// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { kanbanColumnFilter, type Branch, type FilterGroup } from "@beechcms/core"
import type { ContentListWithMeta } from "@/lib/content-api"
import { getCardsFromCache, isBlockedKanbanDrop } from "../../utils/use-kanban-drag"

const optionalAxis: Branch = { id: "br_11", alias: "priority", label: "Priority", type: "tags", multiple: false, options: [{ value: "low", color: "#64748b" }] }
const requiredAxis: Branch = { ...optionalAxis, requiredOnUpdate: true }

describe("isBlockedKanbanDrop", () => {
  it.each([
    ["blocks a cross-column drop on the null column of a required axis", requiredAxis, null, false, true],
    ["allows a reorder inside the null column of a required axis", requiredAxis, null, true, false],
    ["allows a cross-column drop on an option column of a required axis", requiredAxis, "low", false, false],
    ["allows a cross-column drop on the null column of an optional axis", optionalAxis, null, false, false],
  ] as const)("%s", (_name, branch, destColValue, isSameColumn, expected) => {
    const blocked = isBlockedKanbanDrop(branch, destColValue, isSameColumn)

    expect(blocked).toBe(expected)
  })
})

describe("getCardsFromCache", () => {
  const statusAxis: Branch = { id: "br_status", alias: "status_axis", label: "Status", type: "tags", multiple: false, options: [{ value: "todo", color: "#64748b" }] }

  function seedColumnQuery(
    queryClient: QueryClient,
    colValue: string | null,
    activeFilters: FilterGroup[],
    search: string,
    entries: { id: string; position: string | null }[],
  ) {
    const allFilters: FilterGroup[] = [kanbanColumnFilter(statusAxis, colValue), ...activeFilters]
    queryClient.setQueryData(["kanban", "articles", "br_status", colValue, allFilters, search, null], {
      pageParams: [0],
      pages: [{
        items: entries.map(e => ({ id: e.id, schema_slug: "articles", slug: null, status: "published", data: {}, created_at: null, updated_at: null, position: e.position })),
        total: entries.length,
        page: 0,
        limit: 20,
      } satisfies ContentListWithMeta],
    })
  }

  // Regression guard for #753: a search/filter change leaves the PREVIOUS query cached
  // alongside the new one under TanStack's default gcTime. Both legitimately contain the
  // same card. A key that only matches the "todo" column prefix (ignoring search/filters)
  // pulls in the stale query too, so the same entry is counted twice, resequenceCards treats
  // the repeated position as a collision, and the live card gets reassigned to the bottom.
  it("does not merge a stale cached query left behind by a cleared search into the live column", () => {
    const queryClient = new QueryClient()
    // Stale: cached while the user had typed "doc" into the search box.
    seedColumnQuery(queryClient, "todo", [], "doc", [{ id: "e1", position: "a0" }])
    // Live: cached after the user cleared the search box — the query actually rendered.
    seedColumnQuery(queryClient, "todo", [], "", [{ id: "e1", position: "a0" }])

    const cards = getCardsFromCache(queryClient, "articles", "br_status", statusAxis, "todo", [], "", null)

    expect(cards).toHaveLength(1)
    expect(cards[0].position).toBe("a0")
  })
})
