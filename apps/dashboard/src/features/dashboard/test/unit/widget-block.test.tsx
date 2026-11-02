// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DndContext } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import type { DashboardWidgetInstance } from "@beechcms/core"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetBlock } from "@/features/dashboard/builder/widget-block"
import type { UseDashboardBuilderResult } from "@/features/dashboard/builder"
import { hydrateEffectivePermissions } from "@/features/shared/hooks/use-permissions"
import { FULL_AUTHORITY } from "@/test/me-payload"

afterEach(cleanup)

const fullAuthority = hydrateEffectivePermissions(FULL_AUTHORITY as Parameters<typeof hydrateEffectivePermissions>[0])

function renderBlock(widget: DashboardWidgetInstance, permissions = fullAuthority) {
  const onConfigure = vi.fn()
  const ops = { replaceWidget: vi.fn(), removeWidget: vi.fn(), duplicateWidget: vi.fn(() => true), moveWidgetToPage: vi.fn(() => true), updateWidgetTitle: vi.fn() }

  render(
    <DndContext>
      <SortableContext items={[`widget:${widget.id}`]}>
        <WidgetBlock
          pageId="page-1"
          sectionId="section-1"
          columnId="col-1"
          widget={widget}
          span={12}
          otherPages={[]}
          ops={ops as unknown as UseDashboardBuilderResult}
          permissions={permissions}
          onConfigure={onConfigure}
          onNotice={vi.fn()}
        />
      </SortableContext>
    </DndContext>,
  )

  return { ops, onConfigure }
}

describe("WidgetBlock", () => {
  it("renders a locked placeholder as 'Widget unavailable' without a gear, a remove control or a menu", () => {
    renderBlock({ id: "w-locked", type: "core/locked", config: {} })

    expect(screen.getByText("Widget unavailable")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Configure" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getByText("Widget unavailable"))
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0)
  })

  it("never configures a locked placeholder, whatever is pressed on it", async () => {
    const { onConfigure } = renderBlock({ id: "w-locked", type: "core/locked", config: {} })

    await userEvent.click(screen.getByText("Widget unavailable"))
    await userEvent.dblClick(screen.getByText("Widget unavailable"))
    await userEvent.keyboard("{Enter}")

    expect(onConfigure).not.toHaveBeenCalled()
  })

  it("offers only widgets the author can use in 'Replace with…'", async () => {
    const reader = hydrateEffectivePermissions({ global: [], byScope: { posts: ["content:read"] } })
    renderBlock({ id: "w1", type: "core/text", config: {} }, reader)

    fireEvent.contextMenu(screen.getByRole("button", { name: "Text" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: /Replace with/i }))

    expect(screen.queryByRole("menuitem", { name: "Setup Checklist" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Media Gallery" })).not.toBeInTheDocument()
  })
})
