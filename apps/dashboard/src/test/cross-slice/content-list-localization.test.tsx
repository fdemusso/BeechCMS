// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Cross-slice: content-management + shared. `useContentList` calls the real `useSchema` /
 * `useLocaleConfig` / `useLocalizeEntryData` chain from `@/features/shared` — only `@/lib/rpc`
 * is mocked — to prove localized list items resolve to the default locale end to end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"
import type { Seed } from "@beechcms/core"

const mocked = vi.hoisted(() => ({ settings: vi.fn(), schema: vi.fn(), list: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { settings: { $get: mocked.settings }, schema: { $get: mocked.schema }, content: { ":slug": { $get: mocked.list } } } },
}))

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
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.settings.mockResolvedValue({ json: async () => SETTINGS })
  })

  it("exposes list items with localized fields resolved to the default locale", async () => {
    mocked.schema.mockResolvedValue({ json: async () => [LOCALIZED_SEED] })
    mocked.list.mockImplementation(async ({ param }: { param: { slug: string } }) => {
      if (param.slug === "loc_items") {
        return {
          json: async () => ({
            items: [{
              id: "e1", slug: null, status: "published", has_pending_draft: false,
              data: { title: { it: "Scarpa", en: "Shoe" } }, created_at: null, updated_at: null,
            }],
            total: 1, page: 1, limit: 25, relations: {},
          }),
        }
      }
      throw new Error(`unexpected request: ${param.slug}`)
    })

    const { result } = renderHook(() => useContentList("loc_items", { page: 1, limit: 25 }), { wrapper })

    await waitFor(() => expect(result.current.data?.items[0]?.data.title).toBe("Scarpa"))
  })

  it("makes no settings request when no seed is localized", async () => {
    mocked.schema.mockResolvedValue({ json: async () => [PLAIN_SEED] })
    mocked.list.mockImplementation(async ({ param }: { param: { slug: string } }) => {
      if (param.slug === "plain_items") {
        return {
          json: async () => ({
            items: [{
              id: "e1", slug: null, status: "published", has_pending_draft: false,
              data: { title: "Hello" }, created_at: null, updated_at: null,
            }],
            total: 1, page: 1, limit: 25, relations: {},
          }),
        }
      }
      throw new Error(`unexpected request: ${param.slug}`)
    })

    const { result } = renderHook(() => useContentList("plain_items", { page: 1, limit: 25 }), { wrapper })

    await waitFor(() => expect(result.current.data?.items[0]?.data.title).toBe("Hello"))
    expect(mocked.settings).not.toHaveBeenCalled()
  })
})
