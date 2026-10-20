// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Cross-slice: content-management + shared. `useContentList` calls the real `useSchema` /
 * `useLocaleConfig` / `useLocalizeEntryData` chain from `@/features/shared` — only `@/lib/api`
 * is mocked — to prove localized list items resolve to the default locale end to end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"
import type { Seed } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}))

import { api } from "@/lib/api"
import { useContentList } from "@/features/content-management/hooks/use-content-list"

const LOCALIZED_SEED: Seed = {
  slug: "loc_items",
  label: "Item",
  displayNameAlias: "title",
  branches: [{ id: "br_01", alias: "title", label: "Title", type: "text", localized: true }],
}

const PLAIN_SEED: Seed = {
  slug: "plain_items",
  label: "Item",
  displayNameAlias: "title",
  branches: [{ id: "br_01", alias: "title", label: "Title", type: "text" }],
}

const SETTINGS = { locales: ["it", "en"], defaultLocale: "it", defaultLanguage: "it" }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe("useContentList — localized items", () => {
  beforeEach(() => vi.clearAllMocks())

  it("exposes list items with localized fields resolved to the default locale", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/schema") return { data: [LOCALIZED_SEED] }
      if (url === "/settings") return { data: SETTINGS }
      if (url === "/content/loc_items") {
        return {
          data: {
            items: [{
              id: "e1", schema_slug: "loc_items", slug: null, status: "published",
              data: { title: { it: "Scarpa", en: "Shoe" } }, created_at: null, updated_at: null,
            }],
            total: 1, page: 1, limit: 25,
          },
        }
      }
      throw new Error(`unexpected request: ${url}`)
    })

    const { result } = renderHook(() => useContentList("loc_items", { page: 1, limit: 25 }), { wrapper })

    await waitFor(() => expect(result.current.data?.items[0]?.data.title).toBe("Scarpa"))
  })

  it("makes no settings request when no seed is localized", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/schema") return { data: [PLAIN_SEED] }
      if (url === "/content/plain_items") {
        return {
          data: {
            items: [{
              id: "e1", schema_slug: "plain_items", slug: null, status: "published",
              data: { title: "Hello" }, created_at: null, updated_at: null,
            }],
            total: 1, page: 1, limit: 25,
          },
        }
      }
      throw new Error(`unexpected request: ${url}`)
    })

    const { result } = renderHook(() => useContentList("plain_items", { page: 1, limit: 25 }), { wrapper })

    await waitFor(() => expect(result.current.data?.items[0]?.data.title).toBe("Hello"))
    expect(api.get).not.toHaveBeenCalledWith("/settings")
  })
})
