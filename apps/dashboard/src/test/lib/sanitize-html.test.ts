// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { sanitizeHtml } from "@/lib/sanitize-html"

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("")
  })

  it("preserves safe html tags and content", () => {
    const input = "<p>Hello <strong>World</strong></p>"
    expect(sanitizeHtml(input)).toBe(input)
  })

  it("strips script tags", () => {
    const input = '<p>Safe</p><script>alert("xss")</script>'
    expect(sanitizeHtml(input)).not.toContain("script")
    expect(sanitizeHtml(input)).not.toContain("alert")
  })

  it("strips inline event handlers", () => {
    const input = '<img src="x" onerror="alert(1)" />'
    expect(sanitizeHtml(input)).not.toContain("onerror")
  })

  it("strips javascript: URIs", () => {
    const input = '<a href="javascript:alert(1)">Click</a>'
    expect(sanitizeHtml(input)).not.toContain("javascript:")
  })
})
