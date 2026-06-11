// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClientProvider, QueryClient } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import React from "react"
import type { Seed } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import { DataTableWidget } from "@/features/dashboard/components/widgets/data-table-widget"

const seed: Seed = {
  slug: "posts",
  label: "Post",
  displayNameAlias: "title",
  branches: [
    { id: "br_01", alias: "title", type: "text", label: "Title" },
    { id: "br_02", alias: "status", type: "text", label: "Status" },
    { id: "br_03", alias: "secret", type: "text", label: "Secret", policies: { visibility: "hidden" } },
  ],
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithProviders(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function mockApiGet(responses: Record<string, unknown>) {
  ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url in responses) return Promise.resolve({ data: responses[url] })
    throw new Error(`Unexpected api.get("${url}")`)
  })
}

describe("DataTableWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the empty state when the seed has no entries", async () => {
    mockApiGet({
      "/schema": [seed],
      "/widget/list/posts": { entries: [], total: 0 },
    })

    renderWithProviders(<DataTableWidget config={{ seedSlug: "posts" }} />)

    await waitFor(() => expect(screen.getByText("No entries")).toBeInTheDocument())
  })

  it("renders configured columns and never shows hidden branch values", async () => {
    mockApiGet({
      "/schema": [seed],
      "/widget/list/posts": {
        entries: [
          { id: "1", slug: "hello-world", status: "published", createdAt: 1000, updatedAt: 1000, title: "Hello World", secret: "TOP-SECRET-VALUE" },
        ],
        total: 1,
      },
    })

    renderWithProviders(<DataTableWidget config={{ seedSlug: "posts", columns: ["title", "status", "secret"] }} />)

    await waitFor(() => expect(screen.getByText("Hello World")).toBeInTheDocument())
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.queryByText("Secret")).not.toBeInTheDocument()
    expect(screen.queryByText("TOP-SECRET-VALUE")).not.toBeInTheDocument()
  })
})
