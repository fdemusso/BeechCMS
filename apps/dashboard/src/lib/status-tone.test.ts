// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { getStatusTone, STATUS_TONE_DOT_CLASS } from "@/lib/status-tone"
import type { StatusTone } from "@/lib/status-tone"

describe("getStatusTone", () => {
  it("returns neutral for empty string", () => {
    expect(getStatusTone("")).toBe("neutral")
    expect(getStatusTone("   ")).toBe("neutral")
  })

  it("returns danger for error statuses", () => {
    for (const s of ["error", "failed", "rejected", "archived", "lost"]) {
      expect(getStatusTone(s)).toBe("danger")
      expect(getStatusTone(s.toUpperCase())).toBe("danger")
    }
  })

  it("returns success for positive statuses", () => {
    for (const s of ["published", "active", "approved", "online", "won"]) {
      expect(getStatusTone(s)).toBe("success")
    }
  })

  it("returns warning for draft/pending statuses", () => {
    for (const s of ["draft", "pending", "qualification", "negotiation"]) {
      expect(getStatusTone(s)).toBe("warning")
    }
  })

  it("returns info for info statuses", () => {
    for (const s of ["new", "info", "demo", "proposal"]) {
      expect(getStatusTone(s)).toBe("info")
    }
  })

  it("returns neutral for unknown statuses", () => {
    expect(getStatusTone("custom-status")).toBe("neutral")
    expect(getStatusTone("whatever")).toBe("neutral")
  })

  it("is case-insensitive and trims whitespace", () => {
    expect(getStatusTone("  Published  ")).toBe("success")
    expect(getStatusTone("DRAFT")).toBe("warning")
  })
})

describe("STATUS_TONE_DOT_CLASS", () => {
  const tones: StatusTone[] = ["neutral", "success", "warning", "danger", "info"]

  it("has a dot class for every tone", () => {
    for (const tone of tones) {
      expect(STATUS_TONE_DOT_CLASS[tone]).toMatch(/^bg-/)
    }
  })
})
