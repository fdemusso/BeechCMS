// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ConsentPage } from "./consent-page"

const mocked = vi.hoisted(() => ({
  getAuthorizationRequest: vi.fn(),
  submitConsent: vi.fn(),
}))
vi.mock("../api/oauth.api", () => ({
  oauthApi: {
    getAuthorizationRequest: mocked.getAuthorizationRequest,
    submitConsent: mocked.submitConsent,
  },
}))

const assignMock = vi.fn()
Object.defineProperty(window, "location", { value: { assign: assignMock }, writable: true })

function renderPage(search = "?client_id=beech-mcp-cli") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/oauth/consent${search}`]}>
        <ConsentPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("ConsentPage", () => {
  beforeEach(() => {
    mocked.getAuthorizationRequest.mockReset()
    mocked.submitConsent.mockReset()
    assignMock.mockReset()
  })

  it("renders the consent screen once the authorization request resolves and requires consent", async () => {
    mocked.getAuthorizationRequest.mockResolvedValue({
      client: { clientId: "beech-mcp-cli", name: "Beech MCP CLI" },
      requestedScopes: ["schema:read"],
      newScopes: ["schema:read"],
      consentRequired: true,
      redirectUri: "http://127.0.0.1:8976/callback",
      state: "s",
    })
    renderPage()
    expect(await screen.findByText(/Beech MCP CLI/)).toBeInTheDocument()
  })

  it("silently approves and redirects without rendering the screen when consent is not required", async () => {
    mocked.getAuthorizationRequest.mockResolvedValue({
      client: { clientId: "beech-mcp-cli", name: "Beech MCP CLI" },
      requestedScopes: ["schema:read"],
      newScopes: [],
      consentRequired: false,
      redirectUri: "http://127.0.0.1:8976/callback",
      state: "s",
    })
    mocked.submitConsent.mockResolvedValue({ redirectTo: "http://127.0.0.1:8976/callback?code=abc&state=s" })

    renderPage()

    await waitFor(() => expect(mocked.submitConsent).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("http://127.0.0.1:8976/callback?code=abc&state=s"))
    expect(screen.queryByText(/wants to access/i)).not.toBeInTheDocument()
  })

  it("shows an error card when the authorization request fails", async () => {
    mocked.getAuthorizationRequest.mockRejectedValue(new Error("bad request"))
    renderPage()
    expect(await screen.findByText("This authorization request is not valid")).toBeInTheDocument()
  })
})
