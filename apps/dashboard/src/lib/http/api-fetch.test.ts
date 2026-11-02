// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "./api-error"
import { createApiFetch, type ApiFetchOptions } from "./api-fetch"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function sentHeaders(fetchImpl: ReturnType<typeof vi.fn>, call: number): Headers {
  return new Headers((fetchImpl.mock.calls[call][1] as RequestInit).headers)
}

describe("createApiFetch", () => {
  let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>
  let refreshAccessToken: ReturnType<typeof vi.fn<() => Promise<string>>>
  let onSessionExpired: ReturnType<typeof vi.fn<() => void>>
  let token: string | null

  function build(overrides: Partial<ApiFetchOptions> = {}): typeof fetch {
    return createApiFetch({
      getAccessToken: () => token,
      refreshAccessToken,
      onSessionExpired,
      fetchImpl,
      ...overrides,
    })
  }

  beforeEach(() => {
    token = "stale-token"
    fetchImpl = vi.fn<typeof fetch>()
    refreshAccessToken = vi.fn<() => Promise<string>>().mockResolvedValue("fresh-token")
    onSessionExpired = vi.fn<() => void>()
    // The 401 → refresh path only exists in a browser; the guard reads `globalThis.window`.
    vi.stubGlobal("window", {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends the Bearer token and always includes credentials", async () => {
    fetchImpl.mockResolvedValueOnce(json(200, { ok: true }))
    const apiFetch = build()

    const response = await apiFetch("/api/settings")

    expect(response.status).toBe(200)
    expect(sentHeaders(fetchImpl, 0).get("Authorization")).toBe("Bearer stale-token")
    expect((fetchImpl.mock.calls[0][1] as RequestInit).credentials).toBe("include")
  })

  it("omits Authorization when signed out", async () => {
    token = null
    fetchImpl.mockResolvedValueOnce(json(200, {}))
    const apiFetch = build()

    await apiFetch("/api/settings")

    expect(sentHeaders(fetchImpl, 0).has("Authorization")).toBe(false)
  })

  it("keeps an Authorization header the caller set explicitly", async () => {
    fetchImpl.mockResolvedValueOnce(json(200, {}))
    const apiFetch = build()

    await apiFetch("/api/settings", { headers: { Authorization: "Bearer caller" } })

    expect(sentHeaders(fetchImpl, 0).get("Authorization")).toBe("Bearer caller")
  })

  it("never sets Content-Type, so a FormData body keeps the multipart boundary the browser adds", async () => {
    fetchImpl.mockResolvedValueOnce(json(200, {}))
    const apiFetch = build()
    const form = new FormData()
    form.append("file", new Blob(["x"]), "x.txt")

    await apiFetch("/api/upload", { method: "POST", body: form })

    expect(sentHeaders(fetchImpl, 0).has("Content-Type")).toBe(false)
    expect((fetchImpl.mock.calls[0][1] as RequestInit).body).toBe(form)
  })

  it("throws an ApiError carrying the status and the parsed problem body on a non-2xx", async () => {
    fetchImpl.mockResolvedValueOnce(json(409, { type: "https://beechcms.dev/problems/content-slug-conflict" }))
    const apiFetch = build()

    const failure = apiFetch("/api/content/posts", { method: "POST" })

    await expect(failure).rejects.toBeInstanceOf(ApiError)
    await expect(failure).rejects.toMatchObject({
      status: 409,
      data: { type: "https://beechcms.dev/problems/content-slug-conflict" },
    })
  })

  it("lets a network failure through unwrapped", async () => {
    fetchImpl.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    const apiFetch = build()

    const failure = apiFetch("/api/settings")

    await expect(failure).rejects.toThrow(TypeError)
  })

  describe("on a 401", () => {
    it("refreshes once and replays the request with the fresh token", async () => {
      fetchImpl.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, { items: [] }))
      const apiFetch = build()

      const response = await apiFetch("/api/content/posts", { method: "POST", body: JSON.stringify({ a: 1 }) })

      expect(response.status).toBe(200)
      expect(refreshAccessToken).toHaveBeenCalledTimes(1)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(sentHeaders(fetchImpl, 1).get("Authorization")).toBe("Bearer fresh-token")
      expect((fetchImpl.mock.calls[1][1] as RequestInit).body).toBe(JSON.stringify({ a: 1 }))
    })

    it("replaces an Authorization header the caller set, because it is the stale one", async () => {
      fetchImpl.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, {}))
      const apiFetch = build()

      await apiFetch("/api/settings", { headers: { Authorization: "Bearer stale-caller" } })

      expect(sentHeaders(fetchImpl, 1).get("Authorization")).toBe("Bearer fresh-token")
    })

    it.each(["/auth/login", "/auth/refresh"])("does not refresh a 401 from %s", async (path) => {
      fetchImpl.mockResolvedValueOnce(json(401, { error: "Invalid credentials" }))
      const apiFetch = build()

      const failure = apiFetch(path, { method: "POST" })

      await expect(failure).rejects.toMatchObject({ status: 401 })
      expect(refreshAccessToken).not.toHaveBeenCalled()
      expect(onSessionExpired).not.toHaveBeenCalled()
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it("signals session expiry and rethrows the refresh failure when the refresh is rejected", async () => {
      const refreshFailure = new ApiError(401, { error: "Invalid refresh token" })
      refreshAccessToken.mockRejectedValueOnce(refreshFailure)
      fetchImpl.mockResolvedValueOnce(json(401, {}))
      const apiFetch = build()

      const failure = apiFetch("/api/settings")

      await expect(failure).rejects.toBe(refreshFailure)
      expect(onSessionExpired).toHaveBeenCalledTimes(1)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it("throws the ApiError instead of refreshing again when the replay is rejected too", async () => {
      // Regression guard: replaying through the same interceptor looped forever on a token the
      // server keeps refusing; the replay must be the last attempt.
      fetchImpl.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, { detail: "still no" }))
      const apiFetch = build()

      const failure = apiFetch("/api/settings")

      await expect(failure).rejects.toMatchObject({ status: 401, data: { detail: "still no" } })
      expect(refreshAccessToken).toHaveBeenCalledTimes(1)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it("does not refresh outside a browser", async () => {
      vi.stubGlobal("window", undefined)
      fetchImpl.mockResolvedValueOnce(json(401, {}))
      const apiFetch = build()

      const failure = apiFetch("/api/settings")

      await expect(failure).rejects.toMatchObject({ status: 401 })
      expect(refreshAccessToken).not.toHaveBeenCalled()
    })
  })

  describe("request budget", () => {
    it("aborts a request after the default budget by attaching a timeout signal", async () => {
      fetchImpl.mockResolvedValueOnce(json(200, {}))
      const apiFetch = build()

      await apiFetch("/api/settings")

      const signal = (fetchImpl.mock.calls[0][1] as RequestInit).signal
      expect(signal).toBeInstanceOf(AbortSignal)
    })

    it("attaches no signal when the budget is disabled for a long download and the caller passed none", async () => {
      fetchImpl.mockResolvedValueOnce(json(200, {}))
      const apiFetch = build({ timeoutMs: 0 })

      await apiFetch("/api/content/posts/export")

      expect((fetchImpl.mock.calls[0][1] as RequestInit).signal).toBeUndefined()
    })

    it("still honours the caller's own signal when the budget is disabled", async () => {
      fetchImpl.mockImplementationOnce((_, init) => {
        init?.signal?.throwIfAborted()
        return Promise.resolve(json(200, {}))
      })
      const apiFetch = build({ timeoutMs: 0 })
      const controller = new AbortController()
      controller.abort()

      const failure = apiFetch("/api/content/posts/export", { signal: controller.signal })

      await expect(failure).rejects.toMatchObject({ name: "AbortError" })
    })
  })
})
