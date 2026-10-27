// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

import { widgetClientFromGet, type WidgetGet } from "@/test/widget-client"
import { WidgetSdkProvider } from "@beechcms/widget-sdk"
import { StatWidget } from "@/features/dashboard/components/widgets/stat-widget"

const widgetGet = vi.fn<WidgetGet>()
const widgetClient = widgetClientFromGet((url, config) => widgetGet(url, config))

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <WidgetSdkProvider client={widgetClient}>
        {ui}
      </WidgetSdkProvider>
    </QueryClientProvider>,
  )
}

describe("StatWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the aggregate value and label with minimal config", async () => {
    ;widgetGet.mockImplementation((url: string) => {
      if (url === "/widget/aggregate/posts") return Promise.resolve({ data: { value: 42, window: "month" } })
      if (url === "/widget/growth/posts") return Promise.resolve({ data: { current: 42, previous: 40, percentageChange: 5, trend: "up" } })
      throw new Error(`Unexpected widget get("${url}")`)
    })

    renderWithClient(<StatWidget config={{ seedSlug: "posts", label: "Posts" }} />)

    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument())
    expect(screen.getByText("Posts")).toBeInTheDocument()
  })

  it("renders an error state with retry when the aggregate request fails", async () => {
    ;widgetGet.mockRejectedValue(new Error("network error"))

    renderWithClient(<StatWidget config={{ seedSlug: "posts", label: "Posts" }} />)

    await waitFor(() => expect(screen.getByRole("button")).toBeInTheDocument())
  })
})
