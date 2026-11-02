// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { ApiError, apiErrorFromResponse, isApiError, problemCode } from "./api-error"

describe("apiErrorFromResponse", () => {
  it("carries the status and the parsed JSON problem body", async () => {
    const response = new Response(JSON.stringify({ type: "https://beechcms.dev/problems/not-found", detail: "gone" }), {
      status: 404,
    })

    const error = await apiErrorFromResponse(response)

    expect(error.status).toBe(404)
    expect(error.data).toEqual({ type: "https://beechcms.dev/problems/not-found", detail: "gone" })
  })

  it("parses the problem body of a response the caller would have read as a blob", async () => {
    // A failed export is requested with responseType "blob"; the body must still come out as JSON.
    const response = new Response(new Blob([JSON.stringify({ type: "content-import-file-too-large" })]), { status: 413 })

    const error = await apiErrorFromResponse(response)

    expect(error.data?.type).toBe("content-import-file-too-large")
  })

  it.each([
    ["an empty body", ""],
    ["a non-JSON body", "<html>Bad gateway</html>"],
    ["a JSON array", "[1,2]"],
    ["a JSON scalar", "42"],
  ])("leaves data null for %s", async (_, body) => {
    const response = new Response(body, { status: 502 })

    const error = await apiErrorFromResponse(response)

    expect(error.status).toBe(502)
    expect(error.data).toBeNull()
  })
})

describe("isApiError", () => {
  it("recognises an ApiError and rejects look-alikes", () => {
    const lookAlike = { status: 404, data: null }

    expect(isApiError(new ApiError(404, null))).toBe(true)
    expect(isApiError(lookAlike)).toBe(false)
    expect(isApiError(new Error("boom"))).toBe(false)
  })
})

describe("problemCode", () => {
  it("returns the last segment of a problem type URI", () => {
    const error = new ApiError(409, { type: "https://beechcms.dev/problems/content-slug-conflict" })

    expect(problemCode(error)).toBe("content-slug-conflict")
  })

  it("returns a bare slug unchanged", () => {
    const error = new ApiError(409, { type: "content-slug-conflict" })

    expect(problemCode(error)).toBe("content-slug-conflict")
  })

  it.each([
    ["an ApiError without a body", new ApiError(500, null)],
    ["an ApiError whose body has no type", new ApiError(500, { detail: "x" })],
    ["an error that is not an ApiError", new Error("boom")],
    ["a value that is not an error", "boom"],
  ])("returns null for %s", (_, error) => {
    expect(problemCode(error)).toBeNull()
  })
})
