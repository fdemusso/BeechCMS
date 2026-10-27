// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The public `/auth/*` calls outside login: the real `hc` against a stubbed `fetch`, so the URL,
 * the verb and the body each call site relies on are pinned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { rpc } from "./rpc"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("public auth endpoints through rpc", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("GET /auth/setup answers the status the root gate polls", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { needsSetup: false }))

    const response = await rpc.auth.setup.$get()

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/auth/setup")
    expect(init?.method).toBe("GET")
    expect(await response.json()).toEqual({ needsSetup: false })
  })

  it("POST /auth/setup sends the wizard payload as JSON", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { success: true }))
    const payload = {
      name: "Ada", surname: "Lovelace", email: "ada@beech.local", password: "a-valid-password",
      settings: { language: "en", timezone: "UTC", currency: "EUR" },
      track: "developer" as const, loadDemoData: true,
    }

    await rpc.auth.setup.$post({ json: payload })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/auth/setup")
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe(JSON.stringify(payload))
  })

  it("GET /auth/features reads the password-reset flag", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { passwordReset: true }))

    const response = await rpc.auth.features.$get()

    expect(String(fetchMock.mock.calls[0][0])).toBe("/auth/features")
    expect(await response.json()).toEqual({ passwordReset: true })
  })

  it("POST /auth/forgot-password sends the email and the UI language", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true }))

    await rpc.auth["forgot-password"].$post({ json: { email: "ada@beech.local", locale: "it" } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/auth/forgot-password")
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe(JSON.stringify({ email: "ada@beech.local", locale: "it" }))
  })

  it("POST /auth/reset-password sends the token, the new password and the UI language", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true }))

    await rpc.auth["reset-password"].$post({ json: { token: "t", password: "a-valid-password", locale: "en" } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/auth/reset-password")
    expect(init?.method).toBe("POST")
    expect(init?.body).toBe(JSON.stringify({ token: "t", password: "a-valid-password", locale: "en" }))
  })
})
