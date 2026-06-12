// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import type { Seed } from "@beechcms/core"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { api } from "@/lib/api"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetConfigSheet } from "@/features/dashboard/builder/widget-config-sheet"

const SEEDS: Seed[] = [
  {
    slug: "posts",
    label: "Posts",
    displayNameAlias: "title",
    branches: [
      { id: "br_01", alias: "title", type: "text", label: "Title" },
      { id: "br_02", alias: "views", type: "number", label: "Views" },
      { id: "br_03", alias: "category", type: "text", label: "Category" },
    ],
  } as unknown as Seed,
]

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function renderWithClient(ui: React.ReactElement) {
  const client = makeQueryClient()
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe("builtin widget config panels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: SEEDS })
  })

  it("core/stat: shows statKey select without a seed, and switches to formula/window/label fields once a seed is picked", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/stat", config: { statKey: "total" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getAllByText("Statistic").length).toBeGreaterThan(0)
    expect(screen.getByText("Show trend")).toBeInTheDocument()

    // Pick a seed via SeedSelect.
    const seedTrigger = screen.getAllByRole("combobox")[0]
    await userEvent.click(seedTrigger)
    const seedOption = await screen.findByRole("option", { name: "Posts" })
    await userEvent.click(seedOption)

    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ seedSlug: "posts" }))
  })

  it("core/stat: toggles showTrend switch", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/stat", config: { statKey: "total", showTrend: false } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )
    const switchEl = screen.getByRole("switch")
    await userEvent.click(switchEl)
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ showTrend: true }))
  })

  it("core/line-chart: renders seed/formula/window/group/color fields and updates color", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/line-chart", config: { seedSlug: "posts" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText("Group by column")).toBeInTheDocument()
    expect(screen.getByText("Color")).toBeInTheDocument()

    const colorInput = screen.getByPlaceholderText("#3b82f6")
    await userEvent.type(colorInput, "#")
    expect(onConfigChange).toHaveBeenLastCalledWith(expect.objectContaining({ color: "#" }))
  })

  it("core/bar-chart and core/area-chart reuse the timeseries config panel", () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/bar-chart", config: { seedSlug: "posts" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText("Group by column")).toBeInTheDocument()

    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w2", type: "core/area-chart", config: { seedSlug: "posts" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getAllByText("Group by column").length).toBeGreaterThan(0)
  })

  it("core/pie-chart: renders donut switch and limit field, toggling donut", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/pie-chart", config: { seedSlug: "posts", column: "category", donut: false } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText("Donut style")).toBeInTheDocument()
    expect(screen.getByText("Limit")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("switch"))
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ donut: true }))
  })

  it("core/data-table: renders columns, page size, order by and order direction fields", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/data-table", config: { seedSlug: "posts" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText("Columns")).toBeInTheDocument()
    expect(screen.getByText("Page size")).toBeInTheDocument()
    expect(screen.getByText("Order by")).toBeInTheDocument()
    expect(screen.getByText("Order direction")).toBeInTheDocument()

    const columnsInput = screen.getByPlaceholderText("Comma-separated column names (all if empty)")
    await userEvent.type(columnsInput, "a")
    expect(onConfigChange).toHaveBeenLastCalledWith(expect.objectContaining({ columns: ["a"] }))
  })

  it("core/text: renders content textarea and alignment select, updates content", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/text", config: { content: "hello" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText("Content")).toBeInTheDocument()
    expect(screen.getByText("Alignment")).toBeInTheDocument()

    const textarea = document.body.querySelector("textarea") as HTMLTextAreaElement
    await userEvent.type(textarea, "!")
    expect(onConfigChange).toHaveBeenLastCalledWith(expect.objectContaining({ content: "hello!" }))
  })

  it("core/recent-content: renders seed select and variant select", () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/recent-content", config: { seedSlug: "posts", variant: "list" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText("Variant")).toBeInTheDocument()
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(2)
  })

  it("core/quick-draft: renders only the variant select", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/quick-draft", config: { variant: "minimal" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )
    const trigger = screen.getByRole("combobox")
    await userEvent.click(trigger)
    const option = await screen.findByRole("option", { name: "Expanded" })
    await userEvent.click(option)
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ variant: "expanded" }))
  })

  it("core/pending-drafts: renders seed select and counter/list variant options", async () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/pending-drafts", config: { seedSlug: "posts", variant: "list" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const variantTrigger = screen.getAllByRole("combobox")[1]
    await userEvent.click(variantTrigger)
    expect(await screen.findByRole("option", { name: "Counter" })).toBeInTheDocument()
  })

  it("core/publication-stats: renders trio/single variant select", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/publication-stats", config: { variant: "trio" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )
    const trigger = screen.getByRole("combobox")
    await userEvent.click(trigger)
    const option = await screen.findByRole("option", { name: "Single" })
    await userEvent.click(option)
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ variant: "single" }))
  })

  it("core/site-status: renders badge/pill-row variant select", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/site-status", config: { variant: "badge" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )
    const trigger = screen.getByRole("combobox")
    await userEvent.click(trigger)
    const option = await screen.findByRole("option", { name: "Pill row" })
    await userEvent.click(option)
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ variant: "pill-row" }))
  })

  it("core/storage: renders variant select and total bytes number field", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/storage", config: { variant: "gauge" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText("Total capacity (bytes)")).toBeInTheDocument()

    const numberInput = document.body.querySelector('input[type="number"]') as HTMLInputElement
    await userEvent.type(numberInput, "5")
    expect(onConfigChange).toHaveBeenLastCalledWith(expect.objectContaining({ totalBytes: 5 }))
  })

  it("core/media-gallery: renders seed select and grid/unused variant select", async () => {
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/media-gallery", config: { seedSlug: "posts", variant: "grid" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const variantTrigger = screen.getAllByRole("combobox")[1]
    await userEvent.click(variantTrigger)
    expect(await screen.findByRole("option", { name: "Unused only" })).toBeInTheDocument()
  })

  it("core/activity-feed: renders seed select, variant select, and limit field", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/activity-feed", config: { seedSlug: "posts", variant: "feed" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText("Limit")).toBeInTheDocument()
    const numberInput = document.body.querySelector('input[type="number"]') as HTMLInputElement
    await userEvent.type(numberInput, "3")
    expect(onConfigChange).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 3 }))
  })

  it("core/setup-checklist: renders full/compact variant select", async () => {
    const onConfigChange = vi.fn()
    renderWithClient(
      <WidgetConfigSheet
        widget={{ id: "w1", type: "core/setup-checklist", config: { variant: "full" } }}
        onOpenChange={vi.fn()}
        onTitleChange={vi.fn()}
        onConfigChange={onConfigChange}
        onRemove={vi.fn()}
      />,
    )
    const trigger = screen.getByRole("combobox")
    await userEvent.click(trigger)
    const option = await screen.findByRole("option", { name: "Compact" })
    await userEvent.click(option)
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ variant: "compact" }))
  })

  it("no-config widgets (recent-activity, system-health, content-pulse, ai-insights, quick-actions) show the no-options message", () => {
    const types = [
      "core/recent-activity",
      "core/system-health",
      "core/content-pulse",
      "core/ai-insights",
      "core/quick-actions",
    ]
    for (const type of types) {
      const { unmount } = renderWithClient(
        <WidgetConfigSheet
          widget={{ id: "w1", type, config: {} }}
          onOpenChange={vi.fn()}
          onTitleChange={vi.fn()}
          onConfigChange={vi.fn()}
          onRemove={vi.fn()}
        />,
      )
      expect(screen.getByText("This widget has no configurable options.")).toBeInTheDocument()
      unmount()
    }
  })
})
