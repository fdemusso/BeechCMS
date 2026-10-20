// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { z } from "zod"
import type { DashboardLayout, DashboardSection, DashboardWidgetInstance } from "@beechcms/core"
import { registerWidget } from "@/features/dashboard/registry/widget-registry"
import type { DashboardWidgetProps } from "@/features/dashboard/registry/widget-definition"
import { DashboardLayoutRenderer } from "@/features/dashboard/renderer/dashboard-layout-renderer"

// ─── Test-only widget types ──────────────────────────────────────────────────

const markerConfigSchema = z.object({
  label: z.string().catch("default"),
})
type MarkerConfig = z.infer<typeof markerConfigSchema>

function MarkerWidget({ config }: DashboardWidgetProps<MarkerConfig>) {
  return <div>{`MARKER:${config.label}`}</div>
}

registerWidget<MarkerConfig>({
  type: "test/marker",
  labelKey: "test.marker.label",
  category: "custom",
  configSchema: markerConfigSchema,
  defaultConfig: { label: "default" },
  component: MarkerWidget,
})

// No `.catch()`/`.optional()` — an invalid stored config fails `safeParse`.
const strictConfigSchema = z.object({
  requiredNum: z.number(),
})
type StrictConfig = z.infer<typeof strictConfigSchema>

function StrictWidget({ config }: DashboardWidgetProps<StrictConfig>) {
  return <div>{`STRICT:${config.requiredNum}`}</div>
}

registerWidget<StrictConfig>({
  type: "test/strict",
  labelKey: "test.strict.label",
  category: "custom",
  configSchema: strictConfigSchema,
  defaultConfig: { requiredNum: 42 },
  component: StrictWidget,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function widget(type: string, config: Record<string, unknown> = {}, id = type): DashboardWidgetInstance {
  return { id, type, config }
}

function singlePage(slug: string, label: string, sections: DashboardSection[]): DashboardLayout {
  return {
    version: 1,
    pages: [{ id: `page-${slug}`, slug, label, sections }],
  }
}

function renderLayout(layout: DashboardLayout, initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DashboardLayoutRenderer layout={layout} />
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardLayoutRenderer", () => {
  it("renders a single page without a tab strip", () => {
    const layout = singlePage("overview", "Overview", [
      {
        id: "section-1",
        hideLabel: true,
        columns: [{ id: "col-1", widgets: [widget("test/marker", { label: "Solo" })] }],
      },
    ])

    renderLayout(layout)

    expect(screen.getByText("MARKER:Solo")).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
  })

  it("selects the page from ?page=, falling back to the first page for an unknown slug", () => {
    const layout: DashboardLayout = {
      version: 1,
      pages: [
        {
          id: "page-overview",
          slug: "overview",
          label: "Overview",
          sections: [
            { id: "s1", hideLabel: true, columns: [{ id: "c1", widgets: [widget("test/marker", { label: "PageOne" })] }] },
          ],
        },
        {
          id: "page-settings",
          slug: "settings",
          label: "Settings",
          sections: [
            { id: "s2", hideLabel: true, columns: [{ id: "c2", widgets: [widget("test/marker", { label: "PageTwo" })] }] },
          ],
        },
      ],
    }

    const first = renderLayout(layout)
    expect(screen.getByText("MARKER:PageOne")).toBeInTheDocument()
    expect(screen.queryByText("MARKER:PageTwo")).not.toBeInTheDocument()
    first.unmount()

    const second = renderLayout(layout, "/?page=settings")
    expect(screen.getByText("MARKER:PageTwo")).toBeInTheDocument()
    expect(screen.queryByText("MARKER:PageOne")).not.toBeInTheDocument()
    second.unmount()

    renderLayout(layout, "/?page=does-not-exist")
    expect(screen.getByText("MARKER:PageOne")).toBeInTheDocument()
  })

  it("switches pages via the tab strip", async () => {
    const layout: DashboardLayout = {
      version: 1,
      pages: [
        {
          id: "page-overview",
          slug: "overview",
          label: "Overview",
          sections: [
            { id: "s1", hideLabel: true, columns: [{ id: "c1", widgets: [widget("test/marker", { label: "PageOne" })] }] },
          ],
        },
        {
          id: "page-settings",
          slug: "settings",
          label: "Settings",
          sections: [
            { id: "s2", hideLabel: true, columns: [{ id: "c2", widgets: [widget("test/marker", { label: "PageTwo" })] }] },
          ],
        },
      ],
    }

    renderLayout(layout)
    expect(screen.getByText("MARKER:PageOne")).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Settings" }))

    expect(screen.getByText("MARKER:PageTwo")).toBeInTheDocument()
    expect(screen.queryByText("MARKER:PageOne")).not.toBeInTheDocument()
  })

  it("renders a placeholder for an unknown widget type without affecting siblings", () => {
    const layout = singlePage("overview", "Overview", [
      {
        id: "section-1",
        hideLabel: true,
        columns: [
          { id: "col-1", widgets: [widget("@acme/ghost", {})] },
          { id: "col-2", widgets: [widget("test/marker", { label: "SiblingOK" })] },
        ],
        columnSpans: [6, 6],
      },
    ])

    renderLayout(layout)

    expect(screen.getByText("@acme/ghost")).toBeInTheDocument()
    expect(screen.getByText("MARKER:SiblingOK")).toBeInTheDocument()
  })

  it("falls back to defaultConfig when a widget's stored config fails validation", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const layout = singlePage("overview", "Overview", [
      {
        id: "section-1",
        hideLabel: true,
        columns: [{ id: "col-1", widgets: [widget("test/strict", { requiredNum: "not-a-number" })] }],
      },
    ])

    renderLayout(layout)

    expect(screen.getByText("STRICT:42")).toBeInTheDocument()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
