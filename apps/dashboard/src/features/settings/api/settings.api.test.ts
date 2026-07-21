// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for settings/api/settings.api.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock("@/lib/upload", () => ({
  uploadFile: vi.fn(),
}))

import { settingsApi } from "./settings.api"
import { api } from "@/lib/api"
import { uploadFile } from "@/lib/upload"

describe("uploadAvatar", () => {
  beforeEach(() => vi.clearAllMocks())

  it("uses presign/PUT/confirm flow via uploadFile, not POST /upload", async () => {
    const file = new File(["data"], "avatar.png", { type: "image/png" })
    vi.mocked(uploadFile).mockResolvedValueOnce("https://cdn.example.com/avatars/avatar.png")

    const result = await settingsApi.uploadAvatar(file)

    expect(uploadFile).toHaveBeenCalledWith(file)
    expect(api.post).not.toHaveBeenCalledWith("/upload", expect.anything())
    expect(result).toBe("https://cdn.example.com/avatars/avatar.png")
  })

  it("propagates errors", async () => {
    const file = new File(["data"], "avatar.png", { type: "image/png" })
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error("Storage PUT failed: 500"))

    await expect(settingsApi.uploadAvatar(file)).rejects.toThrow("Storage PUT failed: 500")
  })
})
