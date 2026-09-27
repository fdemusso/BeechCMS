// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactNode } from "react"
import type { Seed } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}))

import { api } from "@/lib/api"
import { useLocaleConfig, useLocalizeEntryData } from "./use-locale-config"

const PLAIN_SEED: Seed = {
  slug: "posts",
  label: "Post",
  displayNameAlias: "title",
  branches: [{ id: "br_01", alias: "title", label: "Title", type: "text" }],
}

const LOCALIZED_SEED: Seed = {
  slug: "posts",
  label: "Post",
  displayNameAlias: "title",
  branches: [{ id: "br_01", alias: "title", label: "Title", type: "text", localized: true }],
}

const SETTINGS = { locales: ["it", "en"], defaultLocale: "it", defaultLanguage: "it" }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

function mockApiRoutes(seeds: Seed[]) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/schema") return { data: seeds }
    if (url === "/settings") return { data: SETTINGS }
    throw new Error(`unexpected request: ${url}`)
  })
}

describe("useLocaleConfig", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requests no settings while no seed has a localized branch", async () => {
    mockApiRoutes([PLAIN_SEED])

    const { result } = renderHook(() => useLocaleConfig(), { wrapper })

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/schema"))
    expect(api.get).not.toHaveBeenCalledWith("/settings")
    expect(result.current).toBeUndefined()
  })

  it("returns the project config once a seed has a localized branch", async () => {
    mockApiRoutes([LOCALIZED_SEED])

    const { result } = renderHook(() => useLocaleConfig(), { wrapper })

    await waitFor(() => expect(result.current).toEqual({ locales: ["it", "en"], defaultLocale: "it" }))
  })
})

describe("useLocalizeEntryData", () => {
  beforeEach(() => vi.clearAllMocks())

  it("resolves localized branches to the default locale and leaves other fields untouched", async () => {
    mockApiRoutes([LOCALIZED_SEED])

    const { result } = renderHook(() => useLocalizeEntryData(), { wrapper })

    await waitFor(() => {
      const resolved = result.current(LOCALIZED_SEED, { title: { it: "Scarpa", en: "Shoe" }, sku: "A1" })
      expect(resolved).toEqual({ title: "Scarpa", sku: "A1" })
    })
  })
})
