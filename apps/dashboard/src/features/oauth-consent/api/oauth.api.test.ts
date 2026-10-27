// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { oauthApi } from "./oauth.api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("oauthApi", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("getAuthorizationRequest calls GET /oauth/authorize/request with the query string, outside /api", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { consentRequired: true }))
    const params = new URLSearchParams({ client_id: "beech-mcp-cli" })

    const result = await oauthApi.getAuthorizationRequest(params)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/oauth/authorize/request?client_id=beech-mcp-cli")
    expect(init?.method).toBe("GET")
    expect(result).toEqual({ consentRequired: true })
  })

  it("getAuthorizationRequest sends the first value of a repeated key, the one the server reads", async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}))
    const params = new URLSearchParams("client_id=first&client_id=second&state=s")

    await oauthApi.getAuthorizationRequest(params)

    expect(String(fetchMock.mock.calls[0][0])).toBe("/oauth/authorize/request?client_id=first&state=s")
  })

  it("submitConsent posts the decision body to /oauth/authorize/consent", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { redirectTo: "http://cb" }))
    const body = {
      response_type: "code", client_id: "beech-mcp-cli", redirect_uri: "http://cb",
      scope: "schema:read", state: "s", code_challenge: "c", code_challenge_method: "S256", approved: true,
    }

    const result = await oauthApi.submitConsent(body)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/oauth/authorize/consent")
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe(JSON.stringify(body))
    expect(result).toEqual({ redirectTo: "http://cb" })
  })

  it("getConnectedApps calls GET /oauth/consents", async () => {
    fetchMock.mockResolvedValueOnce(json(200, []))

    const result = await oauthApi.getConnectedApps()

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/oauth/consents")
    expect(init?.method).toBe("GET")
    expect(result).toEqual([])
  })

  it("revokeConnectedApp DELETEs /oauth/consents/:clientId with the id URI-encoded", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { revoked: true, tokensRevoked: 2 }))

    await oauthApi.revokeConnectedApp("beech mcp/cli")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/oauth/consents/beech%20mcp%2Fcli")
    expect(init?.method).toBe("DELETE")
  })
})
