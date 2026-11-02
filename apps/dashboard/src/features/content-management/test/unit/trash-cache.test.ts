// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { CONTENT_QUERY_KEYS } from "../../consts/content.keys"
import { removeEntryFromCachedLists, restoreCachedLists } from "../../lib/trash-cache"

const ENTRY = { id: "c1", slug: "acme", status: "published", data: {}, created_at: 0, updated_at: 0 }
const OTHER = { ...ENTRY, id: "c2", slug: "globex" }

describe("removeEntryFromCachedLists", () => {
  it("drops the entry from a cached list page and lowers its total", async () => {
    const queryClient = new QueryClient()
    const key = CONTENT_QUERY_KEYS.list("clienti", { page: 1 })
    queryClient.setQueryData(key, { items: [ENTRY, OTHER], total: 2 })

    await removeEntryFromCachedLists(queryClient, "clienti", "c1")

    expect(queryClient.getQueryData(key)).toEqual({ items: [OTHER], total: 1 })
  })

  it("leaves alone a cached relation-search result, which is a bare array stored under the same prefix", async () => {
    // RelationEdit caches `searchRelations` (an array of entries) at [...lists(), targetSlug,
    // "relation-search", term]: the same prefix as the seed's list pages, with a different shape.
    const queryClient = new QueryClient()
    const searchKey = [...CONTENT_QUERY_KEYS.lists(), "clienti", "relation-search", ""]
    queryClient.setQueryData(searchKey, [ENTRY, OTHER])

    const removal = removeEntryFromCachedLists(queryClient, "clienti", "c1")

    await expect(removal).resolves.toBeDefined()
    expect(queryClient.getQueryData(searchKey)).toEqual([ENTRY, OTHER])
  })

  it("restores every page it touched from the snapshot", async () => {
    const queryClient = new QueryClient()
    const key = CONTENT_QUERY_KEYS.list("clienti", { page: 1 })
    queryClient.setQueryData(key, { items: [ENTRY, OTHER], total: 2 })

    const snapshot = await removeEntryFromCachedLists(queryClient, "clienti", "c1")
    restoreCachedLists(queryClient, snapshot)

    expect(queryClient.getQueryData(key)).toEqual({ items: [ENTRY, OTHER], total: 2 })
  })
})
