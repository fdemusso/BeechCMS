// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import type { DashboardWidgetInstance } from "@beechcms/core"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetGhost, widgetNeedsSetup } from "@/features/dashboard/builder/ghosts/widget-ghost"
import { seededSeries } from "@/features/dashboard/builder/ghosts/ghost-parts"

const widget = (over: Partial<DashboardWidgetInstance> & Pick<DashboardWidgetInstance, "type">): DashboardWidgetInstance => ({
  id: "w1",
  config: {},
  ...over,
})

describe("seededSeries", () => {
  it("returns the same numbers for the same seed", () => {
    const first = seededSeries("widget-a", 6, 10, 90)

    const second = seededSeries("widget-a", 6, 10, 90)

    expect(second).toEqual(first)
  })

  it("stays inside the requested range", () => {
    const series = seededSeries("widget-b", 200, 30, 80)

    expect(series.every((n) => n >= 30 && n <= 80)).toBe(true)
  })

  it("differs between seeds", () => {
    expect(seededSeries("widget-a", 8, 0, 100)).not.toEqual(seededSeries("widget-c", 8, 0, 100))
  })
})

describe("WidgetGhost", () => {
  it("draws the widget's real title in the header", () => {
    render(<WidgetGhost widget={widget({ type: "core/line-chart", config: { seedSlug: "posts" } })} />)

    expect(screen.getByText("Line Chart")).toBeInTheDocument()
  })

  it("prefers the title the user gave the widget", () => {
    render(<WidgetGhost widget={widget({ type: "core/pie-chart", title: "Mix", config: { seedSlug: "posts" } })} />)

    expect(screen.getByText("Mix")).toBeInTheDocument()
  })

  it("shows the bound seed as a tag", () => {
    render(<WidgetGhost widget={widget({ type: "core/data-table", config: { seedSlug: "articles" } })} />)

    expect(screen.getByText("articles")).toBeInTheDocument()
  })

  it("flags a seed-bound widget whose seed has not been picked", () => {
    const unpicked = widget({ type: "core/data-table", config: { seedSlug: "" } })

    render(<WidgetGhost widget={unpicked} />)

    expect(widgetNeedsSetup(unpicked)).toBe(true)
    expect(screen.getByText("Needs setup")).toBeInTheDocument()
  })

  it("draws a note with its real text", () => {
    render(<WidgetGhost widget={widget({ type: "core/text", config: { content: "Remember the launch" } })} />)

    expect(screen.getByText("Remember the launch")).toBeInTheDocument()
  })

  it("draws an unknown widget type as an unavailable placeholder, never as a blank", () => {
    render(<WidgetGhost widget={widget({ type: "custom/unknown-widget" })} />)

    expect(screen.getByText("custom/unknown-widget")).toBeInTheDocument()
  })

  it("draws a custom (registered-looking) type through the generic card without crashing", () => {
    const { container } = render(<WidgetGhost widget={widget({ type: "core/ai-insights" })} />)

    expect(container.firstChild).not.toBeNull()
  })

  it("is hidden from assistive technology: a ghost is a picture, not content", () => {
    const { container } = render(<WidgetGhost widget={widget({ type: "core/stat", config: { statKey: "total" } })} />)

    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull()
  })

  it("draws the same skeleton for the same widget id, so the drag overlay matches the original", () => {
    const first = render(<WidgetGhost widget={widget({ type: "core/bar-chart", config: { seedSlug: "x" } })} />)
    const second = render(<WidgetGhost widget={widget({ type: "core/bar-chart", config: { seedSlug: "x" } })} />)

    expect(second.container.innerHTML).toBe(first.container.innerHTML)
  })
})
