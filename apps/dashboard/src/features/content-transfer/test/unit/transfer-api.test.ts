// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }))

import { api } from "@/lib/api"
import {
  downloadExport,
  presignImportObject,
  createImportJob,
  readProblem,
  isStorageNotConfiguredError,
} from "../../api/transfer.api"

describe("downloadExport", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requests the export endpoint as a blob with an unbounded timeout", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: new Blob(["a,b"]) })

    await downloadExport("posts", "csv")

    // Regression guard: the client's default 30s timeout truncates a large export mid-stream,
    // which is exactly the corrupted-file failure the server's 413 cap exists to prevent.
    expect(api.get).toHaveBeenCalledWith("/content/posts/export", {
      params: { format: "csv" },
      responseType: "blob",
      timeout: 0,
    })
  })
})

describe("presignImportObject", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the ndjson MIME type even when the file's own type is text/plain", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { uploadUrl: "https://r2.example/upload", key: "objects/1", expiresIn: 60 },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: true }) as unknown as typeof fetch
    const file = new File(["a"], "rows.ndjson", { type: "text/plain" })

    await presignImportObject(file, "ndjson")

    // The upload allowlist has no application/x-ndjson entry, so the wizard presigns
    // under the format's canonical MIME type, never file.type (a browser reports "" for .ndjson).
    expect(api.post).toHaveBeenCalledWith("/upload/presign", {
      filename: "rows.ndjson",
      mimeType: "application/json",
      sizeBytes: file.size,
    })
  })

  it("sends a matching Content-Type on the PUT for csv", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { uploadUrl: "https://r2.example/upload", key: "objects/2", expiresIn: 60 },
    })
    const putMock = vi.fn().mockResolvedValueOnce({ ok: true })
    global.fetch = putMock as unknown as typeof fetch
    const file = new File(["a,b"], "rows.csv", { type: "text/csv" })

    const key = await presignImportObject(file, "csv")

    expect(putMock).toHaveBeenCalledWith(
      "https://r2.example/upload",
      expect.objectContaining({ headers: { "Content-Type": "text/csv" } }),
    )
    expect(key).toBe("objects/2")
  })

  it("rejects when the storage PUT answers a non-ok status", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { uploadUrl: "https://r2.example/upload", key: "objects/3", expiresIn: 60 },
    })
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }) as unknown as typeof fetch
    const file = new File(["a"], "rows.ndjson")

    await expect(presignImportObject(file, "ndjson")).rejects.toThrow(/Storage PUT failed: 500/)
  })
})

describe("createImportJob", () => {
  beforeEach(() => vi.clearAllMocks())

  it("posts objectKey and format and returns the minted jobId", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { jobId: "job-1" } })

    const jobId = await createImportJob("posts", "objects/1", "csv")

    expect(api.post).toHaveBeenCalledWith("/content/posts/import", {
      objectKey: "objects/1",
      format: "csv",
    })
    expect(jobId).toBe("job-1")
  })
})

describe("readProblem", () => {
  it("parses the RFC 7807 body out of a blob error response and returns its type", async () => {
    const body = { type: "content-import-file-too-large", title: "t", status: 413, detail: "d" }
    const error = {
      isAxiosError: true,
      response: { data: new Blob([JSON.stringify(body)]) },
    }

    const problem = await readProblem(error)

    expect(problem?.type).toBe("content-import-file-too-large")
  })

  it("returns null for an error that is not an axios error", async () => {
    const problem = await readProblem(new Error("boom"))

    expect(problem).toBeNull()
  })
})

describe("isStorageNotConfiguredError", () => {
  it("recognizes the native-R2Bucket 501 body, which readProblem cannot parse", async () => {
    const error = {
      isAxiosError: true,
      response: { status: 501, data: { error: "presigned_urls_require_s3_credentials", message: "m" } },
    }

    const result = isStorageNotConfiguredError(error)
    const problem = await readProblem(error)

    // Regression guard: this body has no `type` field, so readProblem must return null for it —
    // the wizard's not-configured branch has to check isStorageNotConfiguredError separately.
    expect(result).toBe(true)
    expect(problem).toBeNull()
  })

  it("returns false for an unrelated 501", () => {
    const error = { isAxiosError: true, response: { status: 501, data: { error: "something_else" } } }

    expect(isStorageNotConfiguredError(error)).toBe(false)
  })
})
