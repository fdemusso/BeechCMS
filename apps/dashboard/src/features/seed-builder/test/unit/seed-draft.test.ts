// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { clearDraft, draftKey, findEditDraftSlug, hasCreateDraft, readDraft, writeDraft } from "../../lib/seed-draft"

const draft = { formData: { label: "Blog Post" }, step: "fields", slugTouched: false }

describe("seed draft", () => {
  it("round-trips a draft and clears it", () => {
    writeDraft(draftKey(null), draft)

    expect(readDraft(draftKey(null))).toMatchObject(draft)

    clearDraft(draftKey(null))
    expect(readDraft(draftKey(null))).toBeNull()
  })

  it("keeps the create draft apart from the draft of each stored seed", () => {
    writeDraft(draftKey(null), draft)
    writeDraft(draftKey("article"), { ...draft, formData: { label: "Article" } })

    expect(readDraft(draftKey(null))?.formData.label).toBe("Blog Post")
    expect(readDraft(draftKey("article"))?.formData.label).toBe("Article")
    expect(hasCreateDraft()).toBe(true)
    expect(findEditDraftSlug()).toBe("article")
  })

  it("finds no draft in empty storage", () => {
    expect(hasCreateDraft()).toBe(false)
    expect(findEditDraftSlug()).toBeNull()
  })

  it("drops a draft older than a week", () => {
    writeDraft(draftKey(null), draft, Date.now() - 8 * 24 * 60 * 60 * 1000)

    expect(readDraft(draftKey(null))).toBeNull()
    expect(localStorage.getItem(draftKey(null))).toBeNull()
  })

  it("ignores corrupted or foreign values", () => {
    localStorage.setItem(draftKey(null), "{not json")
    expect(readDraft(draftKey(null))).toBeNull()

    localStorage.setItem(draftKey(null), JSON.stringify({ formData: [], step: 1 }))
    expect(readDraft(draftKey(null))).toBeNull()
  })

  it("does not throw when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })

    expect(() => writeDraft(draftKey(null), draft)).not.toThrow()

    spy.mockRestore()
  })
})
