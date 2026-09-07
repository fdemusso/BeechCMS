// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { oauthApi } from "./oauth.api"
import { api } from "@/lib/api"

const AUTH_SERVER = { baseURL: "/" }

describe("oauthApi", () => {
  beforeEach(() => vi.clearAllMocks())

  it("getAuthorizationRequest calls GET /oauth/authorize/request with the query string, outside baseURL '/api'", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { consentRequired: true } })
    const params = new URLSearchParams({ client_id: "beech-mcp-cli" })

    const result = await oauthApi.getAuthorizationRequest(params)

    expect(api.get).toHaveBeenCalledWith("/oauth/authorize/request?client_id=beech-mcp-cli", AUTH_SERVER)
    expect(result).toEqual({ consentRequired: true })
  })

  it("submitConsent posts the decision body to /oauth/authorize/consent", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { redirectTo: "http://cb" } })
    const body = {
      response_type: "code", client_id: "beech-mcp-cli", redirect_uri: "http://cb",
      scope: "schema:read", state: "s", code_challenge: "c", code_challenge_method: "S256", approved: true,
    }

    const result = await oauthApi.submitConsent(body)

    expect(api.post).toHaveBeenCalledWith("/oauth/authorize/consent", body, AUTH_SERVER)
    expect(result).toEqual({ redirectTo: "http://cb" })
  })

  it("getConnectedApps calls GET /oauth/consents", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] })

    const result = await oauthApi.getConnectedApps()

    expect(api.get).toHaveBeenCalledWith("/oauth/consents", AUTH_SERVER)
    expect(result).toEqual([])
  })

  it("revokeConnectedApp DELETEs /oauth/consents/:clientId with the id URI-encoded", async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({})

    await oauthApi.revokeConnectedApp("beech mcp/cli")

    expect(api.delete).toHaveBeenCalledWith("/oauth/consents/beech%20mcp%2Fcli", AUTH_SERVER)
  })
})
