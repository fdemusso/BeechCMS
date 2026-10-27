// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, clearAccessToken, logout, refreshToken, setAccessToken } from "./api"
import { ApiError } from "./http/api-error"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function request(fetchMock: ReturnType<typeof vi.fn>, call: number): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

describe("api client", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
  let location: { pathname: string; replace: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    clearAccessToken()
    fetchMock = vi.fn<typeof fetch>()
    location = { pathname: "/admin/content/posts", replace: vi.fn() }
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("window", {})
    vi.stubGlobal("location", location)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("api.get", () => {
    it("prefixes /api and serialises scalar params, skipping undefined and null", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { items: [] }))

      const response = await api.get<{ items: unknown[] }>("/content/posts", {
        params: { page: 2, search: "a b", sortBy: undefined, locale: null, draft: false },
      })

      expect(response.data).toEqual({ items: [] })
      expect(request(fetchMock, 0).url).toBe("/api/content/posts?page=2&search=a+b&draft=false")
    })

    it("sends the in-memory access token as a Bearer header", async () => {
      setAccessToken("jwt-1")
      fetchMock.mockResolvedValueOnce(json(200, {}))

      await api.get("/settings")

      expect(request(fetchMock, 0).headers.get("Authorization")).toBe("Bearer jwt-1")
    })

    it("targets a path outside /api when baseURL is overridden", async () => {
      fetchMock.mockResolvedValueOnce(json(200, []))

      await api.get("/oauth/consents", { baseURL: "/" })

      expect(request(fetchMock, 0).url).toBe("/oauth/consents")
    })

    it("resolves a Blob for responseType blob", async () => {
      fetchMock.mockResolvedValueOnce(new Response("a,b\n1,2\n", { status: 200 }))

      const response = await api.get<Blob>("/content/posts/export", { params: { format: "csv" }, responseType: "blob" })

      expect(response.data).toBeInstanceOf(Blob)
      expect(await response.data.text()).toBe("a,b\n1,2\n")
    })

    it("resolves undefined data for an empty body", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

      const response = await api.get("/anything")

      expect(response.data).toBeUndefined()
    })

    it("gives a long download no timeout signal when timeout is 0", async () => {
      fetchMock.mockResolvedValueOnce(new Response("x", { status: 200 }))

      await api.get<Blob>("/content/posts/export", { responseType: "blob", timeout: 0 })

      expect(request(fetchMock, 0).init.signal).toBeUndefined()
    })

    it("rejects a failed blob download with the parsed problem document", async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ type: "export-too-large", status: 413 }), { status: 413 }))

      const failure = api.get<Blob>("/content/posts/export", { responseType: "blob" })

      await expect(failure).rejects.toMatchObject({ status: 413, data: { type: "export-too-large" } })
    })
  })

  describe("request bodies", () => {
    it("sends an object as JSON with a JSON Content-Type", async () => {
      fetchMock.mockResolvedValueOnce(json(201, { id: "1" }))

      await api.post("/content/posts", { title: "Hi" })

      const sent = request(fetchMock, 0)
      expect(sent.init.method).toBe("POST")
      expect(sent.init.body).toBe(JSON.stringify({ title: "Hi" }))
      expect(sent.headers.get("Content-Type")).toBe("application/json")
    })

    it("passes FormData through with no Content-Type, so the browser adds the boundary", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { url: "u" }))
      const form = new FormData()
      form.append("file", new Blob(["x"]), "x.txt")

      await api.post("/upload", form)

      const sent = request(fetchMock, 0)
      expect(sent.init.body).toBe(form)
      expect(sent.headers.has("Content-Type")).toBe(false)
    })

    it("sends no body and no Content-Type when none is given", async () => {
      fetchMock.mockResolvedValueOnce(json(200, {}))

      await api.post("/content/posts/1/draft/publish")

      const sent = request(fetchMock, 0)
      expect(sent.init.body).toBeUndefined()
      expect(sent.headers.has("Content-Type")).toBe(false)
    })

    it("forwards options.data as the body of a DELETE", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await api.delete("/seeds/posts/hard", { data: { confirm: "posts" } })

      const sent = request(fetchMock, 0)
      expect(sent.init.method).toBe("DELETE")
      expect(sent.init.body).toBe(JSON.stringify({ confirm: "posts" }))
    })

    it("sends caller headers and drops the ones set to undefined", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await api.put("/content/posts/1", { a: 1 }, { headers: { "If-Match": "etag-1", "X-Skip": undefined } })

      const sent = request(fetchMock, 0)
      expect(sent.headers.get("If-Match")).toBe("etag-1")
      expect(sent.headers.has("X-Skip")).toBe(false)
    })
  })

  describe("refreshToken", () => {
    it("shares one POST /auth/refresh among concurrent callers", async () => {
      fetchMock.mockResolvedValue(json(200, { token: "fresh", expiresIn: "15m" }))

      const tokens = await Promise.all([refreshToken(), refreshToken(), refreshToken()])

      expect(tokens).toEqual(["fresh", "fresh", "fresh"])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(request(fetchMock, 0).url).toBe("/auth/refresh")
      expect(request(fetchMock, 0).init.credentials).toBe("include")
    })

    it("stores the new token so the next request carries it", async () => {
      fetchMock
        .mockResolvedValueOnce(json(200, { token: "fresh", expiresIn: "15m" }))
        .mockResolvedValueOnce(json(200, {}))

      await refreshToken()
      await api.get("/settings")

      expect(request(fetchMock, 1).headers.get("Authorization")).toBe("Bearer fresh")
    })

    it("clears the token and rejects with an ApiError when the refresh cookie is refused", async () => {
      setAccessToken("old")
      fetchMock.mockResolvedValueOnce(json(401, { error: "Invalid refresh token" }))

      const failure = refreshToken()

      await expect(failure).rejects.toBeInstanceOf(ApiError)
      fetchMock.mockResolvedValueOnce(json(200, {}))
      await api.get("/settings")
      expect(request(fetchMock, 1).headers.has("Authorization")).toBe(false)
    })

    it("allows a new refresh once the previous one settled", async () => {
      fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, { token: "again", expiresIn: "15m" }))
      await refreshToken().catch(() => undefined)

      const token = await refreshToken()

      expect(token).toBe("again")
    })
  })

  describe("401 handling end to end", () => {
    it("refreshes the session, then replays the failed request with the fresh token", async () => {
      setAccessToken("expired")
      fetchMock
        .mockResolvedValueOnce(json(401, {}))
        .mockResolvedValueOnce(json(200, { token: "fresh", expiresIn: "15m" }))
        .mockResolvedValueOnce(json(200, { ok: true }))

      const response = await api.get<{ ok: boolean }>("/settings")

      expect(response.data).toEqual({ ok: true })
      expect(request(fetchMock, 1).url).toBe("/auth/refresh")
      expect(request(fetchMock, 2).url).toBe("/api/settings")
      expect(request(fetchMock, 2).headers.get("Authorization")).toBe("Bearer fresh")
    })

    it("sends two parallel 401s through a single refresh", async () => {
      setAccessToken("expired")
      fetchMock.mockImplementation((input, init) => {
        const url = String(input)
        if (url === "/auth/refresh") return Promise.resolve(json(200, { token: "fresh", expiresIn: "15m" }))
        const auth = new Headers(init?.headers).get("Authorization")
        return Promise.resolve(auth === "Bearer fresh" ? json(200, { ok: true }) : json(401, {}))
      })

      await Promise.all([api.get("/a"), api.get("/b")])

      const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/auth/refresh")
      expect(refreshCalls).toHaveLength(1)
    })

    it("redirects to the login page when the refresh is refused", async () => {
      setAccessToken("expired")
      fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, { error: "Invalid refresh token" }))

      const failure = api.get("/settings")

      await expect(failure).rejects.toMatchObject({ status: 401 })
      expect(location.replace).toHaveBeenCalledWith("/admin/login")
    })

    it("does not redirect again when already on the login page", async () => {
      location.pathname = "/admin/login"
      fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}))

      await api.get("/settings").catch(() => undefined)

      expect(location.replace).not.toHaveBeenCalled()
    })
  })

  describe("logout", () => {
    it("revokes the session server side, drops the token and sends the user to the login page", async () => {
      setAccessToken("jwt-1")
      fetchMock.mockResolvedValueOnce(json(200, { message: "Logged out" })).mockResolvedValueOnce(json(200, {}))

      await logout()
      await api.get("/settings")

      expect(request(fetchMock, 0).url).toBe("/auth/logout")
      expect(request(fetchMock, 0).init.method).toBe("POST")
      expect(location.replace).toHaveBeenCalledWith("/admin/login")
      expect(request(fetchMock, 1).headers.has("Authorization")).toBe(false)
    })

    it("still signs the user out locally when the server cannot be reached", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))

      await logout()

      expect(location.replace).toHaveBeenCalledWith("/admin/login")
      consoleError.mockRestore()
    })
  })
})
