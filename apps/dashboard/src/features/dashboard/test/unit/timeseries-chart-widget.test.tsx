// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { ChartLine as LineChart } from 'reicon-react'

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import { WidgetSdkProvider } from "@beechcms/widget-sdk"
import { TimeseriesChartWidget } from "@/features/dashboard/components/widgets/timeseries-chart-widget"

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

describe("TimeseriesChartWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the empty state when there are no points", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { points: [] } })

    renderWithClient(
      <TimeseriesChartWidget
        config={{ seedSlug: "posts" }}
        kind="line"
        title="Line Chart"
        icon={LineChart}
      />,
    )

    await waitFor(() => expect(screen.getByText("No data yet")).toBeInTheDocument())
  })

  it("renders the chart shell once data is loaded", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { points: [{ label: "2026-06-01", value: 1 }, { label: "2026-06-02", value: 3 }] },
    })

    renderWithClient(
      <TimeseriesChartWidget
        config={{ seedSlug: "posts" }}
        kind="line"
        title="Line Chart"
        icon={LineChart}
      />,
    )

    await waitFor(() => expect(screen.getByText("Line Chart")).toBeInTheDocument())
    expect(screen.queryByText("No data yet")).not.toBeInTheDocument()
  })

  it("renders an error state with retry on failure", async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"))

    renderWithClient(
      <TimeseriesChartWidget
        config={{ seedSlug: "posts" }}
        kind="bar"
        title="Bar Chart"
        icon={LineChart}
      />,
    )

    await waitFor(() => expect(screen.getByRole("button")).toBeInTheDocument())
  })
})
