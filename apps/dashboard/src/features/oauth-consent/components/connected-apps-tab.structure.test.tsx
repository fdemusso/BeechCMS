// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import type { ConnectedApp } from "../types/oauth.types"

const app = (n: number, overrides: Partial<ConnectedApp> = {}): ConnectedApp => ({
  clientId: `client-${n}`, name: `App ${n}`, scopes: ["schema:read", "schema:write"],
  grantedAt: 1_700_000_000 + n, updatedAt: 1_700_000_000, lastIssuedAt: 1_700_000_000, hasActiveTokens: true, ...overrides,
})
const apps = [app(1), app(2, { hasActiveTokens: false }), app(3), app(4), app(5), app(6)]

vi.mock("../hooks/use-oauth-consent", () => ({
  useConnectedApps: () => ({ data: apps, isLoading: false }),
  useRevokeConnectedApp: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ConnectedAppsTab } from "./connected-apps-tab"

describe("Connected apps markup", () => {
  it("is one titled section holding a named table", () => {
    render(<ConnectedAppsTab />)
    expect(screen.getByRole("region", { name: "Connected apps" }).id).toBe("settings-section-connected-apps")
    expect(screen.getByRole("table", { name: "Connected apps" })).toBeInTheDocument()
  })

  it("names every column at the top of the table", () => {
    render(<ConnectedAppsTab />)
    const columns = within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent)
    expect(columns).toEqual(["Application", "Permissions", "Authorized", "Status", "Actions"])
  })

  it("shows five rows, then scrolls them in a shadcn ScrollArea under a header that stays put", () => {
    render(<ConnectedAppsTab />)
    const table = screen.getByRole("table")
    const scroller = table.closest('[data-slot="scroll-area"]') as HTMLElement
    expect(scroller.style.maxHeight).toBe("20rem") // 2.5rem of header + 5 rows of 3.5rem
    expect(within(scroller).getByRole("group", { name: "Connected apps" })).toHaveAttribute("tabindex", "0")
    expect(table.querySelector("thead")).toHaveClass("sticky", "top-0")
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) expect(row).toHaveClass("h-14")
  })

  it("writes the permissions out, dates them as real dates and says whether a token is live", () => {
    render(<ConnectedAppsTab />)
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(apps.length)
    expect(rows[0]).toHaveTextContent("schema:read, schema:write")
    expect(rows[0].querySelector("time[datetime]")).not.toBeNull()
    expect(within(rows[0]).getByText("Active")).toBeInTheDocument()
    expect(within(rows[1]).getByText("no active token")).toBeInTheDocument()
  })

  it("names every revoke button after the app it ends", () => {
    render(<ConnectedAppsTab />)
    for (const a of apps) expect(screen.getByRole("button", { name: `Revoke access of ${a.name}` })).toBeInTheDocument()
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName()
  })

  it("never repeats an id", () => {
    render(<ConnectedAppsTab />)
    const ids = Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
