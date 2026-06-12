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
import { WidgetSdkProvider } from "@beechcms/widget-sdk"
import { PieChartWidget } from "@/features/dashboard/components/widgets/pie-chart-widget"

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <WidgetSdkProvider client={api}>
        {ui}
      </WidgetSdkProvider>
    </QueryClientProvider>,
  )
}

describe("PieChartWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the empty state when there are no slices", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { slices: [] } })

    renderWithClient(<PieChartWidget config={{ seedSlug: "posts", column: "status" }} title="Pie Chart" />)

    await waitFor(() => expect(screen.getByText("No data yet")).toBeInTheDocument())
  })

  it("renders the legend with labels and counts", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { slices: [{ label: "published", value: 5 }, { label: "draft", value: 2 }] },
    })

    renderWithClient(<PieChartWidget config={{ seedSlug: "posts", column: "status", limit: 8 }} title="Pie Chart" />)

    await waitFor(() => expect(screen.getByText("published")).toBeInTheDocument())
    expect(screen.getByText("5")).toBeInTheDocument()
    expect(screen.getByText("draft")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.queryByText(/more/)).not.toBeInTheDocument()
  })

  it("shows a '+N more' caption when slices are truncated", async () => {
    const slices = Array.from({ length: 4 }, (_, i) => ({ label: `cat-${i}`, value: i + 1 }))
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { slices } })

    renderWithClient(<PieChartWidget config={{ seedSlug: "posts", column: "category", limit: 3 }} title="Pie Chart" />)

    await waitFor(() => expect(screen.getByText("+1 more")).toBeInTheDocument())
    expect(screen.queryByText("cat-3")).not.toBeInTheDocument()
  })
})
