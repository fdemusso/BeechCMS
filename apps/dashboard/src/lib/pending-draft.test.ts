// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { shouldShowPendingDraftBadge } from "@/lib/pending-draft"

describe("shouldShowPendingDraftBadge", () => {
  it("restituisce true per entry published con has_pending_draft true", () => {
    expect(shouldShowPendingDraftBadge("published", true)).toBe(true)
    expect(shouldShowPendingDraftBadge("PUBLISHED", true)).toBe(true)
    expect(shouldShowPendingDraftBadge("active", true)).toBe(true)
  })

  it("restituisce false per entry draft anche con has_pending_draft true", () => {
    expect(shouldShowPendingDraftBadge("draft", true)).toBe(false)
    expect(shouldShowPendingDraftBadge("DRAFT", true)).toBe(false)
    expect(shouldShowPendingDraftBadge("Draft", true)).toBe(false)
    expect(shouldShowPendingDraftBadge("  draft  ", true)).toBe(false)
  })

  it("restituisce false per entry archived con has_pending_draft true", () => {
    expect(shouldShowPendingDraftBadge("archived", true)).toBe(false)
    expect(shouldShowPendingDraftBadge("ARCHIVED", true)).toBe(false)
    expect(shouldShowPendingDraftBadge("Archived", true)).toBe(false)
    expect(shouldShowPendingDraftBadge("  archived  ", true)).toBe(false)
  })

  it("restituisce false quando has_pending_draft non è booleano true", () => {
    expect(shouldShowPendingDraftBadge("published", false)).toBe(false)
    expect(shouldShowPendingDraftBadge("published", null)).toBe(false)
    expect(shouldShowPendingDraftBadge("published", undefined)).toBe(false)
    expect(shouldShowPendingDraftBadge("published", 1)).toBe(false)
    expect(shouldShowPendingDraftBadge("published", "true")).toBe(false)
  })

  it("restituisce false quando lo status è assente o non è stringa", () => {
    expect(shouldShowPendingDraftBadge(null, true)).toBe(false)
    expect(shouldShowPendingDraftBadge(undefined, true)).toBe(false)
    expect(shouldShowPendingDraftBadge(123 as any, true)).toBe(false)
    expect(shouldShowPendingDraftBadge({} as any, true)).toBe(false)
  })

  it("gestisce in modo sicuro le proprietà riservate del prototipo", () => {
    const prototypeKeys = [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
      "__proto__",
    ]

    for (const key of prototypeKeys) {
      expect(shouldShowPendingDraftBadge(key, true)).toBe(true)
      expect(shouldShowPendingDraftBadge(key, false)).toBe(false)
    }
  })
})
