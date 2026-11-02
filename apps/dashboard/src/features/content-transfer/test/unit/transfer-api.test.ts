// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({ presign: vi.fn(), createJob: vi.fn(), readJob: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: {
    api: {
      upload: { presign: { $post: mocked.presign } },
      content: { ":slug": { import: { $post: mocked.createJob } }, "import-jobs": { ":id": { $get: mocked.readJob } } },
    },
  },
}))

import { ApiError } from "@/lib/http/api-error"
import {
  fetchImportJob,
  presignImportObject,
  createImportJob,
  readProblem,
  isStorageNotConfiguredError,
} from "../../api/transfer.api"

function presigned(key: string) {
  return { json: async () => ({ uploadUrl: "https://r2.example/upload", key, expiresIn: 60 }) }
}

describe("presignImportObject", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the ndjson MIME type even when the file's own type is text/plain", async () => {
    mocked.presign.mockResolvedValueOnce(presigned("objects/1"))
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: true }) as unknown as typeof fetch
    const file = new File(["a"], "rows.ndjson", { type: "text/plain" })

    await presignImportObject(file, "ndjson")

    // The upload allowlist has no application/x-ndjson entry, so the wizard presigns
    // under the format's canonical MIME type, never file.type (a browser reports "" for .ndjson).
    expect(mocked.presign).toHaveBeenCalledWith({
      json: {
        filename: "rows.ndjson",
        mimeType: "application/json",
        sizeBytes: file.size,
        purpose: "import",
      },
    })
  })

  it("sends a matching Content-Type on the PUT for csv", async () => {
    mocked.presign.mockResolvedValueOnce(presigned("objects/2"))
    const putMock = vi.fn().mockResolvedValueOnce({ ok: true })
    globalThis.fetch = putMock as unknown as typeof fetch
    const file = new File(["a,b"], "rows.csv", { type: "text/csv" })

    const key = await presignImportObject(file, "csv")

    expect(putMock).toHaveBeenCalledWith(
      "https://r2.example/upload",
      expect.objectContaining({ headers: { "Content-Type": "text/csv" } }),
    )
    expect(key).toBe("objects/2")
  })

  it("rejects when the storage PUT answers a non-ok status", async () => {
    mocked.presign.mockResolvedValueOnce(presigned("objects/3"))
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }) as unknown as typeof fetch
    const file = new File(["a"], "rows.ndjson")

    await expect(presignImportObject(file, "ndjson")).rejects.toThrow(/Storage PUT failed: 500/)
  })
})

describe("createImportJob", () => {
  beforeEach(() => vi.clearAllMocks())

  it("posts objectKey and format for the slug and returns the minted jobId", async () => {
    mocked.createJob.mockResolvedValueOnce({ json: async () => ({ jobId: "job-1" }) })

    const jobId = await createImportJob("posts", "objects/1", "csv")

    expect(mocked.createJob).toHaveBeenCalledWith({
      param: { slug: "posts" },
      json: { objectKey: "objects/1", format: "csv" },
    })
    expect(jobId).toBe("job-1")
  })
})

describe("fetchImportJob", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reads the job by id and returns the payload unchanged", async () => {
    const job = { id: "job-1", state: "completed" }
    mocked.readJob.mockResolvedValueOnce({ json: async () => job })

    const result = await fetchImportJob("job-1")

    expect(mocked.readJob).toHaveBeenCalledWith({ param: { id: "job-1" } })
    expect(result).toEqual(job)
  })
})

describe("readProblem", () => {
  it("returns the RFC 7807 body of an ApiError, including its type", () => {
    const body = { type: "content-import-file-too-large", title: "t", status: 413, detail: "d" }
    const error = new ApiError(413, body)

    const problem = readProblem(error)

    expect(problem?.type).toBe("content-import-file-too-large")
  })

  it("returns null for an error that is not an ApiError", () => {
    const problem = readProblem(new Error("boom"))

    expect(problem).toBeNull()
  })
})

describe("isStorageNotConfiguredError", () => {
  it("recognizes the native-R2Bucket 501 body, which readProblem cannot parse", () => {
    const error = new ApiError(501, { error: "presigned_urls_require_s3_credentials", message: "m" })

    const result = isStorageNotConfiguredError(error)
    const problem = readProblem(error)

    // Regression guard: this body has no `type` field, so readProblem must return null for it —
    // the wizard's not-configured branch has to check isStorageNotConfiguredError separately.
    expect(result).toBe(true)
    expect(problem).toBeNull()
  })

  it("returns false for an unrelated 501", () => {
    const error = new ApiError(501, { error: "something_else" })

    expect(isStorageNotConfiguredError(error)).toBe(false)
  })
})
