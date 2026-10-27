// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import React from "react"

const mocked = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { content: { ":slug": { $get: mocked.list } } } },
}))

import { PendingDraftsWidget } from "@/features/dashboard/components/widgets/pending-drafts-widget"
import { RecentContentWidget } from "@/features/dashboard/components/widgets/recent-content-widget"

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("seed-bound widgets without a configured seed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;mocked.list.mockRejectedValue(new Error("404 GET /content/"))
  })

  it("PendingDraftsWidget does not fetch and shows the empty state", async () => {
    renderWithClient(<PendingDraftsWidget seedSlug="" />)

    expect(await screen.findByText("No pending drafts")).toBeInTheDocument()
    expect(mocked.list).not.toHaveBeenCalled()
  })

  it("RecentContentWidget does not fetch and shows the empty state", async () => {
    renderWithClient(<RecentContentWidget seedSlug="" />)

    expect(await screen.findByText("No content")).toBeInTheDocument()
    expect(mocked.list).not.toHaveBeenCalled()
  })
})
