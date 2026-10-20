// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import React from "react"
import type { DragEndEvent } from "@dnd-kit/core"
import type { DashboardLayout } from "@beechcms/core"

const dnd = vi.hoisted(() => ({ onDragEnd: null as null | ((event: DragEndEvent) => void) }))

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>()
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      dnd.onDragEnd = props.onDragEnd as (event: DragEndEvent) => void
      return <actual.DndContext {...props} />
    },
  }
})

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import { WidgetSdkProvider } from "@beechcms/widget-sdk"
import "@/features/dashboard/registry/builtin-widgets"
import { BuilderPane } from "@/features/dashboard/builder/builder-pane"
import { useDashboardBuilder } from "@/features/dashboard/builder/use-dashboard-builder"

const LAYOUT: DashboardLayout = {
  version: 1,
  pages: [
    {
      id: "page-1",
      slug: "overview",
      label: "Overview",
      sections: [
        {
          id: "section-1",
          columns: [
            { id: "col-a", widgets: [{ id: "widget-1", type: "core/text", config: {} }] },
            { id: "col-b", widgets: [] },
          ],
          columnSpans: [6, 6],
        },
      ],
    },
  ],
}

function Harness() {
  const ops = useDashboardBuilder({ initialLayout: LAYOUT })
  return <BuilderPane ops={ops} isSaving={false} onSave={vi.fn()} onReset={vi.fn()} onClose={vi.fn()} />
}

describe("dashboard builder: dropping a widget on an empty column", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] })
  })

  it("moves the widget into the empty column", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <WidgetSdkProvider client={api}>
            <Harness />
          </WidgetSdkProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const addButtons = await screen.findAllByRole("button", { name: /Add Widget/i })
    const emptyColumn = addButtons[1].parentElement as HTMLElement
    expect(within(emptyColumn).queryByRole("button", { name: /text/i })).toBeNull()
    expect(within(addButtons[0].parentElement as HTMLElement).getByRole("button", { name: /text/i })).toBeInTheDocument()

    act(() => {
      dnd.onDragEnd?.({
        active: { id: "widget:page-1:section-1:col-a:widget-1" },
        over: { id: "column:page-1:section-1:col-b" },
      } as unknown as DragEndEvent)
    })

    expect(within(emptyColumn).getByRole("button", { name: /text/i })).toBeInTheDocument()
  })
})
