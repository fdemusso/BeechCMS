// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"

import { getPeekEntryTitle } from "@/features/content-gallery/gallery-peek-title"
import type { Branch, Seed } from "@beechcms/core"
import type { ContentEntry } from "@/lib/dynamic-columns"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBranch(alias: string, type = "text"): Branch {
  return { alias, type, label: alias } as Branch
}

function makeSeed(branches: Branch[]): Seed {
  return {
    slug: "test",
    label: "Test",
    labelPlural: "Tests",
    branches,
  } as Seed
}

function makeEntry(data: Record<string, unknown>, slug?: string, id = "entry-1"): ContentEntry {
  return { id, slug, data, status: "draft" } as ContentEntry
}

// ---------------------------------------------------------------------------
// getPeekEntryTitle
// ---------------------------------------------------------------------------

describe("getPeekEntryTitle", () => {
  it("restituisce il valore del branch title quando esiste ed è non vuoto", () => {
    const seed = makeSeed([makeBranch("title")])
    const entry = makeEntry({ title: "Il mio articolo" })
    expect(getPeekEntryTitle(seed, entry)).toBe("Il mio articolo")
  })

  it("restituisce il valore del branch name in alternativa a title", () => {
    const seed = makeSeed([makeBranch("name")])
    const entry = makeEntry({ name: "Un prodotto" })
    expect(getPeekEntryTitle(seed, entry)).toBe("Un prodotto")
  })

  it("ricade sullo slug dell'entry se il branch ha valore vuoto", () => {
    const seed = makeSeed([makeBranch("title")])
    const entry = makeEntry({ title: "   " }, "my-slug")
    expect(getPeekEntryTitle(seed, entry)).toBe("my-slug")
  })

  it("ricade sull'id se sia il valore che lo slug sono assenti", () => {
    const seed = makeSeed([])
    const entry = makeEntry({}, undefined, "id-99")
    expect(getPeekEntryTitle(seed, entry)).toBe("id-99")
  })

  it("restituisce l'id quando non ci sono branch title/name e lo slug è assente", () => {
    const seed = makeSeed([makeBranch("body", "richtext")])
    const entry = makeEntry({ body: "some text" }, undefined, "id-42")
    expect(getPeekEntryTitle(seed, entry)).toBe("id-42")
  })
})
