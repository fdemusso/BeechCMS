// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConsentScreen metadata={metadata} params={params} />
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
})
