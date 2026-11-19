// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, expect, it, vi } from "vitest"
import { copyText, toastPreview } from "../../lib/copy-text"

function stubClipboard(writeText: ((value: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", { value: writeText ? { writeText } : undefined, configurable: true })
}

function stubExecCommand(result: boolean | Error) {
  const execCommand = vi.fn(() => {
    if (result instanceof Error) throw result
    return result
  })
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true })
  return execCommand
}

describe("copyText", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard")
    Reflect.deleteProperty(document, "execCommand")
  })

  it("uses the async clipboard API and does not touch the selection fallback when it works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    const execCommand = stubExecCommand(true)

    const copied = await copyText("my note")

    expect(copied).toBe(true)
    expect(writeText).toHaveBeenCalledExactlyOnceWith("my note")
    expect(execCommand).not.toHaveBeenCalled()
  })

  it("falls back to the selection copy when the async API rejects", async () => {
    // Regression guard: writeText rejects when the document is not focused, which used to end as "Copy failed".
    stubClipboard(vi.fn().mockRejectedValue(new DOMException("Document is not focused", "NotAllowedError")))
    const execCommand = stubExecCommand(true)

    const copied = await copyText("my note")

    expect(copied).toBe(true)
    expect(execCommand).toHaveBeenCalledExactlyOnceWith("copy")
  })

  it("falls back to the selection copy when there is no async API (insecure origin)", async () => {
    stubClipboard(undefined)
    const execCommand = stubExecCommand(true)

    const copied = await copyText("my note")

    expect(copied).toBe(true)
    expect(execCommand).toHaveBeenCalledExactlyOnceWith("copy")
  })

  it.each([
    ["the fallback refuses", true, false],
    ["the fallback throws", true, new Error("blocked")],
  ])("resolves to false when the API is refused and %s", async (_name, _apiRejects, fallback) => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("denied")))
    stubExecCommand(fallback)

    const copied = await copyText("my note")

    expect(copied).toBe(false)
  })

  it("leaves no helper textarea behind", async () => {
    stubClipboard(undefined)
    stubExecCommand(true)

    await copyText("my note")

    expect(document.querySelector("textarea")).toBeNull()
  })
})

describe("toastPreview", () => {
  it("leaves a short single-line value as it is", () => {
    const preview = toastPreview("2020")

    expect(preview).toBe("2020")
  })

  it("cuts a long value to 40 characters ending in an ellipsis", () => {
    const preview = toastPreview("a".repeat(200))

    expect(preview).toBe(`${"a".repeat(39)}…`)
  })

  it("puts a multi-line value on one line", () => {
    const preview = toastPreview("first line\n\n  second   line")

    expect(preview).toBe("first line second line")
  })
})
