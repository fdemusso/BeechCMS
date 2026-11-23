// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const listAgentIntentsMock = vi.fn()
const getAgentIntentMock = vi.fn()
const getConnectedAppsMock = vi.fn()
vi.mock("../api/oauth.api", () => ({
  oauthApi: {
    listAgentIntents: (...args: unknown[]) => listAgentIntentsMock(...args),
    getAgentIntent: (...args: unknown[]) => getAgentIntentMock(...args),
    getConnectedApps: (...args: unknown[]) => getConnectedAppsMock(...args),
    approveAgentIntent: vi.fn(),
    rejectAgentIntent: vi.fn(),
  },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PendingAgentActionsSection } from "./pending-agent-actions-section"
import type { AgentIntent, AgentIntentDetail, ConnectedApp } from "../types/oauth.types"

const INTENT: AgentIntent = {
  id: "intent-1", operationId: "seeds.delete", method: "DELETE", path: "/api/seeds/posts", risk: "destructive",
  summary: "Delete the posts content type", status: "pending", clientId: "beech-mcp-cli",
  createdAt: 1_700_000_000, expiresAt: 1_700_000_600, decidedAt: null, result: null,
}
const PUBLISH_INTENT: AgentIntent = {
  ...INTENT, id: "intent-2", operationId: "settings.update", method: "PATCH", path: "/api/settings",
  risk: "publish", summary: "Change site settings", clientId: "unknown-client",
}
const APP: ConnectedApp = {
  clientId: "beech-mcp-cli", name: "Beech MCP CLI", scopes: ["agent:approve"],
  grantedAt: 1_700_000_000, updatedAt: 1_700_000_000, lastIssuedAt: 1_700_000_000, hasActiveTokens: true,
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingAgentActionsSection />
    </QueryClientProvider>
  )
}

describe("PendingAgentActionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConnectedAppsMock.mockResolvedValue([APP])
  })

  it("shows the empty message when no action is waiting", async () => {
    listAgentIntentsMock.mockResolvedValue([])

    renderSection()

    expect(await screen.findByText("No actions are waiting for you")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("lists each intent with its summary, method and path, risk badge and the app name of its client", async () => {
    listAgentIntentsMock.mockResolvedValue([INTENT])

    renderSection()

    const row = (await screen.findByText("Delete the posts content type")).closest("tr") as HTMLElement
    expect(within(row).getByText("DELETE /api/seeds/posts")).toBeInTheDocument()
    expect(await within(row).findByText("Beech MCP CLI")).toBeInTheDocument()
    expect(within(row).getByText("Destructive")).toBeInTheDocument()
  })

  it("falls back to the client id when the client is not among the connected apps", async () => {
    listAgentIntentsMock.mockResolvedValue([PUBLISH_INTENT])

    renderSection()

    const row = (await screen.findByText("Change site settings")).closest("tr") as HTMLElement
    expect(within(row).getByText("unknown-client")).toBeInTheDocument()
  })

  it("marks a destructive intent with the destructive badge and a publish intent with the outline badge", async () => {
    listAgentIntentsMock.mockResolvedValue([INTENT, PUBLISH_INTENT])

    renderSection()

    expect(await screen.findByText("Destructive")).toHaveAttribute("data-variant", "destructive")
    expect(screen.getByText("Publishes")).toHaveAttribute("data-variant", "outline")
  })

  it("shows the load error when the list request fails", async () => {
    listAgentIntentsMock.mockRejectedValue(new Error("network"))

    renderSection()

    expect(await screen.findByText("Could not load the pending actions")).toBeInTheDocument()
  })

  it("Review opens the dialog for that intent", async () => {
    listAgentIntentsMock.mockResolvedValue([INTENT])
    const detail: AgentIntentDetail = { ...INTENT, body: null }
    getAgentIntentMock.mockResolvedValue(detail)
    renderSection()

    fireEvent.click(await screen.findByRole("button", { name: "Review Delete the posts content type" }))

    expect(await screen.findByRole("dialog", { name: "Delete the posts content type" })).toBeInTheDocument()
    expect(getAgentIntentMock).toHaveBeenCalledWith("intent-1")
  })
})
