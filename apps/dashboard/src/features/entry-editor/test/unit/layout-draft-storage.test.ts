// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { FormLayout } from "@beechcms/core"
import {
  clearLayoutDraft,
  fingerprintLayout,
  loadLayoutDraft,
  saveLayoutDraft,
} from "@/features/entry-editor/builder/layout-draft-storage"

const savedLayout: FormLayout = {
  version: 1,
  tabs: [{ id: "t1", label: "Main", sections: [{ id: "s1", columns: [{ id: "c1", fields: [{ branchId: "br_a" }] }] }] }],
}
const editedLayout: FormLayout = {
  version: 1,
  tabs: [{ id: "t1", label: "Main", sections: [{ id: "s1", columns: [{ id: "c1", fields: [] }] }] }],
}

const seed = { slug: "posts", layout: savedLayout }

describe("layout draft storage", () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it("returns a saved draft as ready while the server layout is the one it was made against", () => {
    saveLayoutDraft("posts", { base: fingerprintLayout(savedLayout), saved: savedLayout, layout: editedLayout })

    const lookup = loadLayoutDraft(seed)

    expect(lookup).toEqual({
      status: "ready",
      draft: { base: fingerprintLayout(savedLayout), saved: savedLayout, layout: editedLayout },
    })
  })

  it("reports a draft as stale once the server layout has changed", () => {
    saveLayoutDraft("posts", { base: fingerprintLayout(savedLayout), saved: savedLayout, layout: editedLayout })

    const lookup = loadLayoutDraft({ slug: "posts", layout: editedLayout })

    expect(lookup.status).toBe("stale")
  })

  it("matches a draft made for a seed without a stored layout against a seed that still has none", () => {
    saveLayoutDraft("posts", { base: fingerprintLayout(undefined), saved: savedLayout, layout: editedLayout })

    const lookup = loadLayoutDraft({ slug: "posts", layout: undefined })

    expect(lookup.status).toBe("ready")
  })

  it("keeps a half-built layout the strict schema would reject, such as a tab with no section", () => {
    const halfBuilt: FormLayout = { version: 1, tabs: [{ id: "t1", label: "Main", sections: [] }] }
    saveLayoutDraft("posts", { base: fingerprintLayout(savedLayout), saved: savedLayout, layout: halfBuilt })

    const lookup = loadLayoutDraft(seed)

    expect(lookup.status === "ready" && lookup.draft.layout).toEqual(halfBuilt)
  })

  it.each([
    ["not JSON", "{oops"],
    ["a different version", JSON.stringify({ v: 2, base: "x", saved: savedLayout, layout: editedLayout })],
    ["a layout of the wrong shape", JSON.stringify({ v: 1, base: "x", saved: savedLayout, layout: { version: 1, tabs: "no" } })],
  ])("treats stored %s as no draft", (_label, raw) => {
    sessionStorage.setItem("beechcms.layoutDraft.posts", raw)

    const lookup = loadLayoutDraft(seed)

    expect(lookup.status).toBe("none")
  })

  it("keeps drafts of different seeds apart and clears only the one asked for", () => {
    saveLayoutDraft("posts", { base: fingerprintLayout(savedLayout), saved: savedLayout, layout: editedLayout })
    saveLayoutDraft("pages", { base: fingerprintLayout(savedLayout), saved: savedLayout, layout: editedLayout })

    clearLayoutDraft("posts")

    expect([loadLayoutDraft(seed).status, loadLayoutDraft({ slug: "pages", layout: savedLayout }).status]).toEqual(["none", "ready"])
  })

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError") })
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError") })
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("SecurityError") })

    const run = () => {
      saveLayoutDraft("posts", { base: "x", saved: savedLayout, layout: editedLayout })
      clearLayoutDraft("posts")
      return loadLayoutDraft(seed)
    }

    expect(run()).toEqual({ status: "none" })
  })
})

describe("fingerprintLayout", () => {
  it("gives different layouts different fingerprints and the same layout the same one", () => {
    expect(fingerprintLayout(savedLayout)).toBe(fingerprintLayout(structuredClone(savedLayout)))
    expect(fingerprintLayout(savedLayout)).not.toBe(fingerprintLayout(editedLayout))
  })
})
