// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { OAUTH_SCOPES, formatScopes } from "@beechcms/core"
import { ConsentScreen } from "./consent-screen"
import type { AuthorizationRequestMetadata } from "../types/oauth.types"

const mocked = vi.hoisted(() => ({ submitConsent: vi.fn() }))
vi.mock("../api/oauth.api", () => ({
  oauthApi: {
    submitConsent: mocked.submitConsent,
  },
}))

const assignMock = vi.fn()
Object.defineProperty(window, "location", {
  value: { assign: assignMock },
  writable: true,
})

const metadata: AuthorizationRequestMetadata = {
  client: { clientId: "beech-mcp-cli", name: "Beech MCP CLI" },
  requestedScopes: ["schema:read", "schema:write"],
  newScopes: ["schema:write"],
  deniedScopes: [],
  consentRequired: true,
  redirectUri: "http://127.0.0.1:8976/callback",
  state: "abc123",
}

const params = new URLSearchParams({
  response_type: "code",
  client_id: "beech-mcp-cli",
  redirect_uri: "http://127.0.0.1:8976/callback",
  scope: "schema:read schema:write",
  state: "abc123",
  code_challenge: "challenge",
  code_challenge_method: "S256",
})

function renderScreen(screenMetadata: AuthorizationRequestMetadata = metadata, screenParams: URLSearchParams = params) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConsentScreen metadata={screenMetadata} params={screenParams} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("ConsentScreen", () => {
  beforeEach(() => {
    mocked.submitConsent.mockReset()
    assignMock.mockReset()
  })

  it("renders the client name and groups requested scopes into 3-slot icon groups", () => {
    renderScreen()
    expect(screen.getByText(/Beech MCP CLI/)).toBeInTheDocument()
    expect(screen.getByText("Schema")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Schema: Read" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Schema: Write" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Schema: Delete" })).toBeDisabled()
  })

  it("omits action icons on Agent actions and disables unrequested slots on standard domains", () => {
    renderScreen({
      ...metadata,
      client: { clientId: "beech-mcp", name: "Beech MCP" },
      requestedScopes: ["schema:read", "settings:read", "agent:read", "agent:approve"],
      newScopes: ["schema:read", "settings:read", "agent:read", "agent:approve"],
    })

    expect(screen.queryByRole("button", { name: /^Agent actions:/ })).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Agent actions" })).toBeChecked()
    expect(screen.getByRole("button", { name: "Settings: Write" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Settings: Delete" })).toBeDisabled()
  })

  it("marks a domain absent from newScopes as already granted", () => {
    renderScreen({
      ...metadata,
      requestedScopes: ["schema:read"],
      newScopes: [],
    })
    expect(screen.getByText(/already granted/i)).toBeInTheDocument()
  })

  it("clicking Allow posts approved:true with the PKCE parameters from the query string", async () => {
    mocked.submitConsent.mockResolvedValue({ redirectTo: "http://127.0.0.1:8976/callback?code=xyz&state=abc123" })
    renderScreen()
    fireEvent.click(screen.getByText("Allow access"))

    await waitFor(() => expect(mocked.submitConsent).toHaveBeenCalled())
    expect(mocked.submitConsent.mock.calls[0][0]).toEqual(expect.objectContaining({
      approved: true,
      client_id: "beech-mcp-cli",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      state: "abc123",
    }))
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("http://127.0.0.1:8976/callback?code=xyz&state=abc123"))
  })

  it("clicking Deny posts approved:false", async () => {
    mocked.submitConsent.mockResolvedValue({ redirectTo: "http://127.0.0.1:8976/callback?error=access_denied&state=abc123" })
    renderScreen()
    fireEvent.click(screen.getByText("Deny"))

    await waitFor(() => expect(mocked.submitConsent).toHaveBeenCalled())
    expect(mocked.submitConsent.mock.calls[0][0]).toEqual(expect.objectContaining({ approved: false }))
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("http://127.0.0.1:8976/callback?error=access_denied&state=abc123"))
  })
  describe("template picker", () => {
    const allScopesMetadata: AuthorizationRequestMetadata = {
      ...metadata,
      requestedScopes: [...OAUTH_SCOPES],
      newScopes: [...OAUTH_SCOPES],
    }
    const withScope = (scope: string) => new URLSearchParams({ ...Object.fromEntries(params), scope })

    async function postedScope() {
      await waitFor(() => expect(mocked.submitConsent).toHaveBeenCalled())
      return (mocked.submitConsent.mock.calls[0][0] as { scope: string }).scope
    }

    beforeEach(() => {
      mocked.submitConsent.mockResolvedValue({ redirectTo: "http://127.0.0.1:8976/callback?code=xyz" })
    })

    it("preselects the smallest preset that covers the request and hides redundant ones", () => {
      renderScreen(
        {
          ...metadata,
          client: { clientId: "beech-mcp", name: "Beech MCP" },
          requestedScopes: ["schema:read", "schema:write", "settings:read", "agent:read", "agent:approve"],
          newScopes: ["schema:read", "schema:write", "settings:read", "agent:read", "agent:approve"],
        },
        withScope("schema:read schema:write settings:read agent:read agent:approve"),
      )

      const tabs = screen.getAllByRole("tab")
      expect(tabs.map(tab => tab.textContent)).toEqual(["Reader", "Full access"])
      expect(screen.getByRole("tab", { name: "Full access" })).toHaveAttribute("aria-selected", "true")
    })

    it("shows all three presets when all three yield distinct scopes", () => {
      renderScreen(allScopesMetadata, withScope(formatScopes(OAUTH_SCOPES)))

      expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Reader", "Writer", "Full access"])
      expect(screen.getByRole("tab", { name: "Full access" })).toHaveAttribute("aria-selected", "true")
    })

    it("posts only the selected preset scopes on Allow", async () => {
      const user = userEvent.setup()
      renderScreen(allScopesMetadata, withScope(formatScopes(OAUTH_SCOPES)))
      await user.click(screen.getByRole("tab", { name: "Reader" }))

      await user.click(screen.getByText("Allow access"))

      expect(await postedScope()).toBe(
        "schema:read content:read media:read automations:read users:read settings:read analytics:read agent:read agent:approve",
      )
    })

    it("posts the original scope string on Deny", async () => {
      const user = userEvent.setup()
      renderScreen(allScopesMetadata, withScope(formatScopes(OAUTH_SCOPES)))
      await user.click(screen.getByRole("tab", { name: "Reader" }))

      await user.click(screen.getByText("Deny"))

      expect(await postedScope()).toBe(formatScopes(OAUTH_SCOPES))
    })

    it("marks a denied scope as not available and never posts it", async () => {
      renderScreen({ ...metadata, newScopes: ["schema:read"], deniedScopes: ["schema:write"] })

      fireEvent.click(screen.getByText("Allow access"))

      expect(screen.getByText("Not available for your role")).toBeInTheDocument()
      expect(await postedScope()).toBe("schema:read")
    })

    it("disables presets and Allow when nothing would be granted", () => {
      renderScreen(
        { ...metadata, requestedScopes: ["schema:write"], newScopes: [], deniedScopes: ["schema:write"] },
        withScope("schema:write"),
      )

      screen.getAllByRole("tab").forEach(tab => expect(tab).toBeDisabled())
      expect(screen.getByRole("button", { name: /Allow access/ })).toBeDisabled()
    })

    it("allows customizing individual permissions and marks the selection as Custom", async () => {
      const user = userEvent.setup()
      renderScreen(
        {
          ...metadata,
          client: { clientId: "beech-mcp", name: "Beech MCP" },
          requestedScopes: ["schema:read", "schema:write", "settings:read", "agent:read", "agent:approve"],
          newScopes: ["schema:read", "schema:write", "settings:read", "agent:read", "agent:approve"],
        },
        withScope("schema:read schema:write settings:read agent:read agent:approve"),
      )

      await user.click(screen.getByRole("button", { name: "Settings: Read" }))
      expect(screen.getByText("Custom")).toBeInTheDocument()

      await user.click(screen.getByText("Allow access"))
      expect(await postedScope()).toBe("schema:read schema:write agent:read agent:approve")
    })
  })
})
