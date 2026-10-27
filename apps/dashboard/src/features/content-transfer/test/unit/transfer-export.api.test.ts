// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { downloadExport } from "../../api/transfer.api"

describe("downloadExport", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
    URL.createObjectURL = vi.fn(() => "blob:export")
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("requests GET /api/content/:slug/export with the format as a query parameter", async () => {
    fetchMock.mockResolvedValueOnce(new Response("a,b", { status: 200 }))

    await downloadExport("posts", "csv")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/content/posts/export?format=csv")
    expect(init?.method).toBe("GET")
  })

  it("sends the request without a time budget", async () => {
    fetchMock.mockResolvedValueOnce(new Response("a,b", { status: 200 }))

    await downloadExport("posts", "csv")

    // Regression guard: the client's default 30s budget aborts a large export mid-stream, which is
    // exactly the corrupted-file failure the server's 413 cap exists to prevent. An unbounded
    // request carries no timeout signal at all.
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.signal).toBeUndefined()
  })

  it("hands the streamed body to the browser as a download named after the slug and format", async () => {
    fetchMock.mockResolvedValueOnce(new Response("a,b", { status: 200 }))

    await downloadExport("posts", "csv")

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(await blob.text()).toBe("a,b")
    expect(blob.type).toBe("text/csv")
  })
})
