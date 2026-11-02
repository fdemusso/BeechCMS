// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for automations/api/automations.api.ts
 * Runs the real typed client against a stubbed `fetch`, so the URL, verb and body each call sends
 * are what is asserted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { automationsApi } from "./automations.api"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const noContent = () => new Response(null, { status: 204 })

// The shape GET answers with: the stored row, `enabled` as a boolean and the timestamps in seconds.
const automation = {
  id: "a1",
  seed_slug: "posts",
  name: "notify",
  enabled: true,
  triggers: [{ event: "create" }],
  trigger_conditions: null,
  actions: [{ type: "edit_field", field: "status", value: "draft" }],
  created_at: 1000,
  updated_at: 1000,
}

describe("automations api", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("list", () => {
    it("requests the automations of the seed through the query string and returns them", async () => {
      const automations = [automation]
      fetchMock.mockResolvedValueOnce(json(200, automations))

      const result = await automationsApi.list("posts")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/automations?seed=posts")
      expect(init?.method).toBe("GET")
      expect(result).toEqual(automations)
    })
  })

  describe("get", () => {
    it("requests the automation by id under the collection", async () => {
      fetchMock.mockResolvedValueOnce(json(200, automation))

      const result = await automationsApi.get("a1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/automations/a1")
      expect(init?.method).toBe("GET")
      expect(result).toEqual(automation)
    })
  })

  describe("create", () => {
    it("posts the body to the collection and returns the new id", async () => {
      const body = {
        seed_slug: "posts",
        name: "notify",
        triggers: [{ event: "create" as const }],
        actions: [{ type: "edit_field" as const, field: "status", value: "draft" }],
      }
      fetchMock.mockResolvedValueOnce(json(201, { id: "new-id" }))

      const result = await automationsApi.create(body)

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/automations")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify(body))
      expect(result).toEqual({ id: "new-id" })
    })
  })

  describe("update", () => {
    it("puts the body under the automation id and resolves on the empty 204", async () => {
      fetchMock.mockResolvedValueOnce(noContent())

      const result = await automationsApi.update("a1", { name: "renamed" })

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/automations/a1")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBe(JSON.stringify({ name: "renamed" }))
      expect(result).toBeUndefined()
    })
  })

  describe("toggle", () => {
    it("patches enabled under the toggle route of the automation", async () => {
      fetchMock.mockResolvedValueOnce(noContent())

      await automationsApi.toggle("a1", false)

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/automations/a1/toggle")
      expect(init?.method).toBe("PATCH")
      expect(init?.body).toBe(JSON.stringify({ enabled: false }))
    })
  })

  describe("remove", () => {
    it("deletes the automation by id", async () => {
      fetchMock.mockResolvedValueOnce(noContent())

      await automationsApi.remove("a1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/automations/a1")
      expect(init?.method).toBe("DELETE")
    })

    it("rejects with the problem the server answered, so the mutation's onError runs", async () => {
      fetchMock.mockResolvedValueOnce(
        json(404, { type: "https://beechcms.dev/problems/automation-not-found", status: 404 }),
      )

      await expect(automationsApi.remove("gone")).rejects.toMatchObject({
        status: 404,
        data: { type: "https://beechcms.dev/problems/automation-not-found" },
      })
    })
  })
})
