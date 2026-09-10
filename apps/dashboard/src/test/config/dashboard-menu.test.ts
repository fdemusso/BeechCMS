// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { createElement } from "react"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { getStaticMenu, getContentCategoryMenu, type MenuGates } from "@/config/dashboard-menu"
import { NavMain } from "@/components/nav-main"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

const t = (key: string) => key

function gates(overrides: Partial<MenuGates> = {}): MenuGates {
  return { viewAnalytics: false, readContent: false, createContent: false, ...overrides }
}

describe("getContentCategoryMenu (HIDE/DISABLE split)", () => {
  it("readContent: false ⇒ [] (axis one, zero-trust)", () => {
    expect(getContentCategoryMenu(t, gates({ readContent: false }))).toEqual([])
  })

  it("readContent: true, createContent: false ⇒ 3 items, Create New disabled with a reason (axis two, present not filtered)", () => {
    const items = getContentCategoryMenu(t, gates({ readContent: true, createContent: false }))
    expect(items).toHaveLength(3)
    const createNew = items.find((i) => i.url === "/content/create-new")
    expect(createNew?.disabled).toBe(true)
    expect(createNew?.disabledReason).toBeTruthy()
  })

  it("readContent: true, createContent: true ⇒ 3 items, none disabled", () => {
    const items = getContentCategoryMenu(t, gates({ readContent: true, createContent: true }))
    expect(items).toHaveLength(3)
    expect(items.every((i) => !i.disabled)).toBe(true)
  })
})

describe("getStaticMenu (axis one)", () => {
  it("viewAnalytics: false ⇒ Dashboard only, no disabled Analytics entry", () => {
    const items = getStaticMenu(t, gates({ viewAnalytics: false }))
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe("Dashboard")
    expect(items.some((i) => i.url === "/analytics")).toBe(false)
  })

  it("viewAnalytics: true ⇒ Dashboard + Analytics", () => {
    const items = getStaticMenu(t, gates({ viewAnalytics: true }))
    expect(items).toHaveLength(2)
    expect(items.some((i) => i.url === "/analytics")).toBe(true)
  })
})

describe("NavMain disabled rendering", () => {
  it("a disabled item renders no anchor/link and carries aria-disabled=true", () => {
    const items = getContentCategoryMenu(t, gates({ readContent: true, createContent: false }))
    render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          TooltipProvider,
          null,
          createElement(SidebarProvider, null, createElement(NavMain, { items })),
        ),
      ),
    )
    expect(screen.queryByRole("link", { name: /sidebar.createNew/i })).toBeNull()
    const disabledButton = screen.getByText("sidebar.createNew").closest("button")
    expect(disabledButton).toHaveAttribute("aria-disabled", "true")
  })
})
