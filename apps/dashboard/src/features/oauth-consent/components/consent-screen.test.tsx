// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
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

  it("renders the client name and one row per requested scope", () => {
    renderScreen()
    expect(screen.getByText(/Beech MCP CLI/)).toBeInTheDocument()
    expect(screen.getByText("schema:read")).toBeInTheDocument()
    expect(screen.getByText("schema:write")).toBeInTheDocument()
  })

  it("marks a scope absent from newScopes as already granted", () => {
    renderScreen()
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

    it("preselects the smallest template that covers the request", () => {
      renderScreen(
        { ...metadata, requestedScopes: ["content:read", "content:write"], newScopes: ["content:read", "content:write"] },
        withScope("content:read content:write"),
      )

      expect(screen.getByRole("radio", { name: /^Editor/ })).toHaveAttribute("aria-checked", "true")
    })

    it("posts only the selected template scopes on Allow", async () => {
      renderScreen(allScopesMetadata, withScope(formatScopes(OAUTH_SCOPES)))
      fireEvent.click(screen.getByRole("radio", { name: /^Read/ }))

      fireEvent.click(screen.getByText("Allow access"))

      expect(await postedScope()).toBe(
        "schema:read content:read media:read automations:read users:read settings:read analytics:read agent:read agent:approve",
      )
    })

    it("posts the original scope string on Deny", async () => {
      renderScreen(allScopesMetadata, withScope(formatScopes(OAUTH_SCOPES)))
      fireEvent.click(screen.getByRole("radio", { name: /^Read/ }))

      fireEvent.click(screen.getByText("Deny"))

      expect(await postedScope()).toBe(formatScopes(OAUTH_SCOPES))
    })

    it("marks a denied scope as not available and never posts it", async () => {
      renderScreen({ ...metadata, newScopes: ["schema:read"], deniedScopes: ["schema:write"] })

      fireEvent.click(screen.getByText("Allow access"))

      expect(screen.getByText("Not available for your role")).toBeInTheDocument()
      expect(await postedScope()).toBe("schema:read")
    })

    it("disables templates and Allow when nothing would be granted", () => {
      renderScreen(
        { ...metadata, requestedScopes: ["schema:write"], newScopes: [], deniedScopes: ["schema:write"] },
        withScope("schema:write"),
      )

      screen.getAllByRole("radio").forEach(radio => expect(radio).toBeDisabled())
      expect(screen.getByRole("button", { name: /Allow access/ })).toBeDisabled()
    })
  })
})
