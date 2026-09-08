// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ConnectedAppsTab } from "./connected-apps-tab"
import type { ConnectedApp } from "../types/oauth.types"

const getConnectedAppsMock = vi.fn()
const revokeConnectedAppMock = vi.fn()
vi.mock("../api/oauth.api", () => ({
  oauthApi: {
    getConnectedApps: (...args: unknown[]) => getConnectedAppsMock(...args),
    revokeConnectedApp: (...args: unknown[]) => revokeConnectedAppMock(...args),
  },
}))

const APP: ConnectedApp = {
  clientId: "beech-mcp-cli",
  name: "Beech MCP CLI",
  scopes: ["schema:read"],
  grantedAt: 1700000000,
  updatedAt: 1700000000,
  lastIssuedAt: 1700000000,
  hasActiveTokens: true,
}

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConnectedAppsTab />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("ConnectedAppsTab", () => {
  beforeEach(() => {
    getConnectedAppsMock.mockReset()
    revokeConnectedAppMock.mockReset()
  })

  it("renders skeletons while loading", () => {
    getConnectedAppsMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderTab()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it("renders the empty message when there are no connected apps", async () => {
    getConnectedAppsMock.mockResolvedValue([])
    renderTab()
    expect(await screen.findByText("No connected apps")).toBeInTheDocument()
  })

  it("renders app name, scope badges, and the no-active-token badge only when applicable", async () => {
    getConnectedAppsMock.mockResolvedValue([{ ...APP, hasActiveTokens: false }])
    renderTab()
    expect(await screen.findByText("Beech MCP CLI")).toBeInTheDocument()
    expect(screen.getByText("schema:read")).toBeInTheDocument()
    expect(screen.getByText("no active token")).toBeInTheDocument()
  })

  it("does not render the no-active-token badge when a token is active", async () => {
    getConnectedAppsMock.mockResolvedValue([APP])
    renderTab()
    expect(await screen.findByText("Beech MCP CLI")).toBeInTheDocument()
    expect(screen.queryByText("no active token")).not.toBeInTheDocument()
  })

  it("confirming the dialog calls revokeConnectedApp with the right clientId and shows a success toast", async () => {
    getConnectedAppsMock.mockResolvedValue([APP])
    revokeConnectedAppMock.mockResolvedValue(undefined)
    renderTab()
    await screen.findByText("Beech MCP CLI")

    fireEvent.click(screen.getByRole("button", { name: "" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(revokeConnectedAppMock).toHaveBeenCalled())
    expect(revokeConnectedAppMock.mock.calls[0][0]).toBe("beech-mcp-cli")
  })
})
