// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import { StatWidget } from "@/features/dashboard/components/widgets/stat-widget"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(React.createElement(QueryClientProvider, { client }, ui))
}

describe("StatWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the aggregate value and label with minimal config", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/widget/aggregate/posts") return Promise.resolve({ data: { value: 42, window: "month" } })
      if (url === "/widget/growth/posts") return Promise.resolve({ data: { current: 42, previous: 40, percentageChange: 5, trend: "up" } })
      throw new Error(`Unexpected api.get("${url}")`)
    })

    renderWithClient(<StatWidget config={{ seedSlug: "posts", label: "Posts" }} />)

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument())
    expect(screen.getByText("Posts")).toBeInTheDocument()
  })

  it("renders an error state with retry when the aggregate request fails", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"))

    renderWithClient(<StatWidget config={{ seedSlug: "posts", label: "Posts" }} />)

    await waitFor(() => expect(screen.getByRole("button")).toBeInTheDocument())
  })
})
