// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"

function State() {
  const { state } = useSidebar()
  return <div data-testid="state">{state}</div>
}

function renderSidebar() {
  return render(
    <SidebarProvider defaultOpen>
      <State />
      <input aria-label="name" />
      <textarea aria-label="notes" />
    </SidebarProvider>,
  )
}

describe("SidebarProvider keyboard shortcut", () => {
  beforeEach(() => {
    document.cookie = "sidebar_state=; max-age=0; path=/"
  })

  it("Ctrl+B outside a field collapses the sidebar", () => {
    renderSidebar()

    fireEvent.keyDown(document.body, { key: "b", ctrlKey: true })

    expect(screen.getByTestId("state").textContent).toBe("collapsed")
  })

  it("Ctrl+B typed in an input leaves the sidebar alone", () => {
    renderSidebar()

    fireEvent.keyDown(screen.getByLabelText("name"), { key: "b", ctrlKey: true })

    expect(screen.getByTestId("state").textContent).toBe("expanded")
  })

  it("Ctrl+B typed in a textarea leaves the sidebar alone", () => {
    renderSidebar()

    fireEvent.keyDown(screen.getByLabelText("notes"), { key: "b", ctrlKey: true })

    expect(screen.getByTestId("state").textContent).toBe("expanded")
  })

  it("Ctrl+B already handled by an editor (defaultPrevented) leaves the sidebar alone", () => {
    renderSidebar()
    document.body.addEventListener("keydown", (event) => event.preventDefault(), { once: true })

    fireEvent.keyDown(document.body, { key: "b", ctrlKey: true })

    expect(screen.getByTestId("state").textContent).toBe("expanded")
  })
})
