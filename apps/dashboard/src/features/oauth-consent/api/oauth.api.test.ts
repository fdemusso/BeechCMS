// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, problemCode } from "@/lib/http/api-error"
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

  it("listAgentIntents calls GET /api/agent/intents and returns the intents array", async () => {
    const intents = [{ id: "i1", summary: "Delete seed" }]
    fetchMock.mockResolvedValueOnce(json(200, { intents }))

    const result = await oauthApi.listAgentIntents()

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/agent/intents")
    expect(init?.method).toBe("GET")
    expect(result).toEqual(intents)
  })

  it("getAgentIntent encodes the id in the path and returns the intent", async () => {
    const intent = { id: "a/b", body: { slug: "posts" } }
    fetchMock.mockResolvedValueOnce(json(200, { intent }))

    const result = await oauthApi.getAgentIntent("a/b")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/agent/intents/a%2Fb")
    expect(init?.method).toBe("GET")
    expect(result).toEqual(intent)
  })

  it("approveAgentIntent posts to …/approve and returns intent and result", async () => {
    const approval = { intent: { id: "i1" }, result: { status: 200, body: null } }
    fetchMock.mockResolvedValueOnce(json(200, approval))

    const result = await oauthApi.approveAgentIntent("i1")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/agent/intents/i1/approve")
    expect(init?.method).toBe("POST")
    expect(result).toEqual(approval)
  })

  it("rejectAgentIntent posts to …/reject and returns the intent", async () => {
    const intent = { id: "i1", status: "rejected" }
    fetchMock.mockResolvedValueOnce(json(200, { intent }))

    const result = await oauthApi.rejectAgentIntent("i1")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/agent/intents/i1/reject")
    expect(init?.method).toBe("POST")
    expect(result).toEqual(intent)
  })

  it("a 409 intent_expired rejects with an ApiError whose problem code is intent_expired", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { type: "https://beechcms.dev/problems/intent_expired", status: 409 }))

    const failure = await oauthApi.approveAgentIntent("i1").catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect(problemCode(failure)).toBe("intent_expired")
  })
})
