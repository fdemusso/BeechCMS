// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Command } from "@/components/ui/command"
import { SearchResultsView } from "../../_parts/search-results-view"

const mocked = vi.hoisted(() => ({ search: vi.fn() }))

vi.mock("@/lib/rpc", () => ({ rpc: { api: { search: { $get: mocked.search } } } }))
// The debounce only delays the request; the test is about what is requested and shown.
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: <T,>(value: T) => value }))

const ENTRY = {
  id: "0c1f6d36-9c8a-4a78-8c2e-3f2f4f6a1b11",
  schema_slug: "articles",
  slug: "hello",
  status: "published",
  title: "Hello world",
  excerpt: "say <mark>hello</mark> to everyone",
  data: {},
}

function renderView(search: string, navigate = vi.fn(), setOpen = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Command>
        <SearchResultsView search={search} seeds={[]} navigate={navigate} setOpen={setOpen} />
      </Command>
    </QueryClientProvider>
  )
  return { navigate, setOpen }
}

describe("SearchResultsView", () => {
  beforeEach(() => vi.clearAllMocks())

  it("asks the search endpoint for the term with a limit of 8 and lists the entries", async () => {
    mocked.search.mockResolvedValueOnce({ json: async () => ({ items: [ENTRY], nextCursor: null, total: 1 }) })

    renderView("hello")

    expect(await screen.findByText("Hello world")).toBeInTheDocument()
    expect(mocked.search).toHaveBeenCalledWith({ query: { q: "hello", limit: "8" } })
    expect(screen.getByText("articles · published")).toBeInTheDocument()
  })

  it("choosing a result opens the entry and closes the palette", async () => {
    mocked.search.mockResolvedValueOnce({ json: async () => ({ items: [ENTRY], nextCursor: null, total: 1 }) })
    const { navigate, setOpen } = renderView("hello")
    const user = userEvent.setup()

    await user.click(await screen.findByText("Hello world"))

    expect(navigate).toHaveBeenCalledWith(`/content/articles/${ENTRY.id}`)
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it("a term shorter than two characters sends no request", async () => {
    renderView("h")

    await waitFor(() => expect(mocked.search).not.toHaveBeenCalled())
  })
})
