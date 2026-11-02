// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Tests for lib/upload.ts. The real `hc` client runs against a stubbed `fetch`, so the assertions
 * are on the requests that actually leave the browser.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { deleteUpload, uploadFile } from "./upload"

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const STORAGE_URL = "https://r2.example/put?sig=1"

describe("uploadFile", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("presigns, PUTs the bytes to storage, confirms the key and returns the media url", async () => {
    const file = new File(["data"], "photo.png", { type: "image/png" })
    fetchMock
      .mockResolvedValueOnce(json(200, { uploadUrl: STORAGE_URL, key: "1700-abc-photo.png", expiresIn: 900 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json(200, { url: "/api/media/1700-abc-photo.png" }))

    const url = await uploadFile(file)

    expect(url).toBe("/api/media/1700-abc-photo.png")
    const [presign, put, confirm] = fetchMock.mock.calls
    expect(String(presign[0])).toBe("/api/upload/presign")
    expect(presign[1]?.method).toBe("POST")
    expect(presign[1]?.body).toBe(JSON.stringify({ filename: "photo.png", mimeType: "image/png", sizeBytes: file.size }))
    expect(put[0]).toBe(STORAGE_URL)
    expect(put[1]).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/png" }, body: file })
    expect(String(confirm[0])).toBe("/api/upload/confirm")
    expect(confirm[1]?.body).toBe(JSON.stringify({ key: "1700-abc-photo.png" }))
  })

  it("falls back to the multipart upload when the server cannot presign, sending no Content-Type of its own", async () => {
    const file = new File(["data"], "photo.png", { type: "image/png" })
    fetchMock
      .mockResolvedValueOnce(json(501, { error: "presigned_urls_require_s3_credentials", message: "m" }))
      .mockResolvedValueOnce(json(200, { url: "/api/media/1700-abc-photo.png", key: "1700-abc-photo.png" }))

    const url = await uploadFile(file)

    expect(url).toBe("/api/media/1700-abc-photo.png")
    const [fallbackUrl, fallbackInit] = fetchMock.mock.calls[1]
    expect(String(fallbackUrl)).toBe("/api/upload")
    expect(fallbackInit?.method).toBe("POST")
    // Regression guard: a hand-set multipart Content-Type would lack the boundary the browser adds.
    expect(new Headers(fallbackInit?.headers).has("Content-Type")).toBe(false)
    const form = fallbackInit?.body as FormData
    expect((form.get("file") as File).name).toBe("photo.png")
  })

  it("does not fall back when the presign is refused for a reason other than missing storage credentials", async () => {
    const file = new File(["data"], "virus.exe", { type: "application/x-msdownload" })
    fetchMock.mockResolvedValueOnce(json(400, { error: "File type not allowed" }))

    const result = uploadFile(file)

    await expect(result).rejects.toMatchObject({ status: 400 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejects when the storage PUT answers a non-ok status, without confirming", async () => {
    const file = new File(["data"], "photo.png", { type: "image/png" })
    fetchMock
      .mockResolvedValueOnce(json(200, { uploadUrl: STORAGE_URL, key: "1700-abc-photo.png", expiresIn: 900 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    const result = uploadFile(file)

    await expect(result).rejects.toThrow("Storage PUT failed: 500")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("deleteUpload", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("deletes the key under /api/upload, percent-encoded so a name with a space or a hash stays one segment", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true }))

    await deleteUpload("1700-abc-orphan #1.jpg")

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("/api/upload/1700-abc-orphan%20%231.jpg")
    expect(init?.method).toBe("DELETE")
  })
})
