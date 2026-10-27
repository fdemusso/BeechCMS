// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  api: { delete: vi.fn() },
}))

import { api } from "@/lib/api"
import { contentApi } from "@/features/content-management/api/content.api"

describe("contentApi.delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("appends purge=true only when the purge option is set", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } })

    await contentApi.delete("posts", "entry-1")
    await contentApi.delete("posts", "entry-1", { purge: true })

    expect(api.delete).toHaveBeenNthCalledWith(1, "/content/posts/entry-1")
    expect(api.delete).toHaveBeenNthCalledWith(2, "/content/posts/entry-1?purge=true")
  })
})
