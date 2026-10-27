// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for settings/api/settings.api.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/upload", () => ({
  uploadFile: vi.fn(),
}))

import { settingsApi } from "./settings.api"
import { uploadFile } from "@/lib/upload"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("settings api", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("uploadAvatar", () => {
    it("uses presign/PUT/confirm flow via uploadFile, not POST /upload", async () => {
      const file = new File(["data"], "avatar.png", { type: "image/png" })
      vi.mocked(uploadFile).mockResolvedValueOnce("https://cdn.example.com/avatars/avatar.png")

      const result = await settingsApi.uploadAvatar(file)

      expect(uploadFile).toHaveBeenCalledWith(file)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result).toBe("https://cdn.example.com/avatars/avatar.png")
    })

    it("propagates errors", async () => {
      const file = new File(["data"], "avatar.png", { type: "image/png" })
      vi.mocked(uploadFile).mockRejectedValueOnce(new Error("Storage PUT failed: 500"))

      await expect(settingsApi.uploadAvatar(file)).rejects.toThrow("Storage PUT failed: 500")
    })
  })

  describe("getStorage", () => {
    it("requests the selected orphan page", async () => {
      const storage = { totalBytes: 510, fileCount: 51, orphans: [], orphanTotal: 51, orphanBytes: 510, orphanOffset: 50, orphanLimit: 50 }
      fetchMock.mockResolvedValueOnce(json(200, storage))

      const result = await settingsApi.getStorage(50)

      expect(String(fetchMock.mock.calls[0][0])).toBe("/api/settings/storage?offset=50")
      expect(result).toEqual(storage)
    })
  })

  describe("deleteOrphans", () => {
    it("posts the reviewed keys to the orphan cleanup route", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { deleted: ["media/a.png"], totalBytes: 0, fileCount: 0 }))

      await settingsApi.deleteOrphans(["media/a.png"])

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/settings/storage/orphans/delete")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe(JSON.stringify({ keys: ["media/a.png"] }))
    })
  })

  describe("revokeSession", () => {
    it("deletes the session by id under the sessions route", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await settingsApi.revokeSession("sess-1")

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/settings/sessions/sess-1")
      expect(init?.method).toBe("DELETE")
    })
  })

  describe("updateAvatar", () => {
    it("sends null to clear the avatar, so the server can tell it from an absent field", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { success: true }))

      await settingsApi.updateAvatar(null)

      const [url, init] = fetchMock.mock.calls[0]
      expect(String(url)).toBe("/api/settings/avatar")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBe(JSON.stringify({ avatarUrl: null }))
    })
  })
})
