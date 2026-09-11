// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClientProvider, QueryClient } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import React from "react"
import type { DashboardLayout } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import "@/features/dashboard/registry/builtin-widgets"
import { DashboardLayoutRenderer } from "@/features/dashboard/renderer/dashboard-layout-renderer"

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

describe("core/text config fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("falls back to defaultConfig when the stored config fails validation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })

    const layout: DashboardLayout = {
      version: 1,
      pages: [
        {
          id: "page-overview",
          slug: "overview",
          label: "Overview",
          sections: [
            {
              id: "section-1",
              hideLabel: true,
              columns: [{ id: "col-1", widgets: [{ id: "w-1", type: "core/text", config: { content: 123, align: "diagonal" } }] }],
            },
          ],
        },
      ],
    }

    renderWithProviders(<DashboardLayoutRenderer layout={layout} />)

    await waitFor(() => expect(warnSpy).toHaveBeenCalled())
    expect(screen.queryByText("123")).not.toBeInTheDocument()

    warnSpy.mockRestore()
  })
})
