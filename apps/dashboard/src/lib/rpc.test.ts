// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest"
import { clearAccessToken, setAccessToken } from "./api"
import { ApiError } from "./http/api-error"
import { rpc } from "./rpc"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("rpc", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    clearAccessToken()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("window", {})
    vi.stubGlobal("location", { pathname: "/admin/login", replace: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("rpc.auth.login", () => {
    it("POSTs the JSON credentials to /auth/login outside the /api prefix, sending credentials", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { token: "jwt", expiresIn: "15m" }))

      const response = await rpc.auth.login.$post({ json: { email: "a@b.com", password: "password1" } })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/auth/login")
      expect(init?.method).toBe("POST")
      expect(init?.credentials).toBe("include")
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json")
      expect(init?.body).toBe(JSON.stringify({ email: "a@b.com", password: "password1" }))
      expect(await response.json()).toEqual({ token: "jwt", expiresIn: "15m" })
    })

    it("throws an ApiError for a refused login instead of returning the 401 response", async () => {
      fetchMock.mockResolvedValueOnce(json(401, { error: "Invalid credentials" }))

      const failure = rpc.auth.login.$post({ json: { email: "a@b.com", password: "password1" } })

      await expect(failure).rejects.toBeInstanceOf(ApiError)
      await expect(failure).rejects.toMatchObject({ status: 401, data: { error: "Invalid credentials" } })
      // A wrong password is a verdict, not an expired session: no refresh round-trip.
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("infers the success body from the server and the request body from the shared schema", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { token: "jwt", expiresIn: "15m" }))

      const response = await rpc.auth.login.$post({ json: { email: "a@b.com", password: "password1" } })
      const body = await response.json()

      expectTypeOf(body).toEqualTypeOf<{ token: string; expiresIn: string }>()
      // Checked by `tsc -b`: the schema makes `password` mandatory, so this must not compile.
      // @ts-expect-error password is missing from the request body
      void (() => rpc.auth.login.$post({ json: { email: "a@b.com" } }))
    })
  })

  describe("rpc.auth.refresh", () => {
    it("is never retried through a token refresh when the refresh cookie is refused", async () => {
      setAccessToken("expired")
      fetchMock.mockResolvedValueOnce(json(401, { error: "Invalid refresh token" }))

      const failure = rpc.auth.refresh.$post()

      await expect(failure).rejects.toMatchObject({ status: 401 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe("rpc.api.content.notifications", () => {
    it("addresses one notification by id under /api with the verb the router registers", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await rpc.api.content.notifications[":id"].read.$patch({ param: { id: "n-1" } })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/content/notifications/n-1/read")
      expect(init?.method).toBe("PATCH")
    })

    it("types the list rows as the API serialises them", async () => {
      fetchMock.mockResolvedValueOnce(
        json(200, [{ id: "n-1", title: "T", message: "M", type: "info", isRead: false, createdAt: 100 }]),
      )

      const response = await rpc.api.content.notifications.$get()
      const rows = await response.json()

      // The popover once read `is_read` / `created_at` off an `any[]`; the wire names are camelCase.
      type Row = (typeof rows)[number]
      expectTypeOf<Row["isRead"]>().toEqualTypeOf<boolean>()
      expectTypeOf<Row["createdAt"]>().toEqualTypeOf<number>()
      expectTypeOf<Row>().not.toHaveProperty("is_read")
      expect(rows).toHaveLength(1)
    })
  })
})
