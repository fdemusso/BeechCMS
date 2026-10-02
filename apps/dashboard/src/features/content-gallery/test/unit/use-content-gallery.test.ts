// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useContentGallery } from "@/features/content-gallery/gallery-hooks/use-content-gallery"
import type { ContentEntry } from "@/lib/dynamic-columns"
import type { Branch, Seed } from "@beechcms/core"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBranch(alias: string, type = "text"): Branch {
  return { alias, type, label: alias } as Branch
}

const seed: Seed = {
  slug: "articles",
  label: "Article",
  labelPlural: "Articles",
  branches: [makeBranch("title")],
} as Seed

function makeEntry(id: string, extra: Partial<ContentEntry> = {}): ContentEntry {
  return { id, slug: id, data: { title: `Entry ${id}` }, status: "draft", ...extra } as ContentEntry
}

const data: ContentEntry[] = [makeEntry("e1"), makeEntry("e2")]

// ---------------------------------------------------------------------------
// useContentGallery
// ---------------------------------------------------------------------------

describe("useContentGallery", () => {
  it("parte con peekId null e restituisce cardModels per ogni entry", () => {
    const { result } = renderHook(() => useContentGallery(seed, data, null))

    expect(result.current.peekId).toBeNull()
    expect(result.current.peekEntry).toBeNull()
    expect(result.current.cardModels).toHaveLength(2)
    expect(result.current.cardModels[0].entryId).toBe("e1")
  })

  it("setPeekId aggiorna peekEntry all'entry corrispondente", () => {
    const { result } = renderHook(() => useContentGallery(seed, data, null))

    act(() => {
      result.current.setPeekId("e2")
    })

    expect(result.current.peekId).toBe("e2")
    expect(result.current.peekEntry?.id).toBe("e2")
  })

  it("reimposta peekId a null quando l'entry viene rimossa dai dati", () => {
    let entries = [...data]
    const { result, rerender } = renderHook(
      ({ d }: { d: ContentEntry[] }) => useContentGallery(seed, d, null),
      { initialProps: { d: entries } }
    )

    act(() => {
      result.current.setPeekId("e1")
    })
    expect(result.current.peekId).toBe("e1")

    // Simulate removal of e1 from data
    entries = [makeEntry("e2")]
    rerender({ d: entries })

    expect(result.current.peekId).toBeNull()
    expect(result.current.peekEntry).toBeNull()
  })

  it("cardModels aggiornano quando cambiano i dati", () => {
    let entries = [makeEntry("e1")]
    const { result, rerender } = renderHook(
      ({ d }: { d: ContentEntry[] }) => useContentGallery(seed, d, null),
      { initialProps: { d: entries } }
    )

    expect(result.current.cardModels).toHaveLength(1)

    entries = [makeEntry("e1"), makeEntry("e3")]
    rerender({ d: entries })

    expect(result.current.cardModels).toHaveLength(2)
    expect(result.current.cardModels[1].entryId).toBe("e3")
  })

  it("gestisce dataset vuoto senza errori", () => {
    const { result } = renderHook(() => useContentGallery(seed, [], null))

    expect(result.current.cardModels).toHaveLength(0)
    expect(result.current.peekEntry).toBeNull()
  })

  it("senza groupBy attivo: categoryAlias null e nessun gruppo", () => {
    const { result } = renderHook(() => useContentGallery(seed, data, null))
    expect(result.current.categoryAlias).toBeNull()
    expect(result.current.categoryGroups).toEqual([])
  })

  it("con groupBy su un campo esistente: raggruppa le voci e mette quelle senza categoria in coda", () => {
    const seedWithCategory = { ...seed, branches: [makeBranch("title"), makeBranch("categoria")] } as Seed
    const entries = [
      makeEntry("e1", { data: { title: "A", categoria: "Matrimonio" } } as Partial<ContentEntry>),
      makeEntry("e2", { data: { title: "B" } } as Partial<ContentEntry>),
      makeEntry("e3", { data: { title: "C", categoria: "matrimonio " } } as Partial<ContentEntry>),
    ]
    const { result } = renderHook(() => useContentGallery(seedWithCategory, entries, "categoria"))

    expect(result.current.categoryAlias).toBe("categoria")
    expect(result.current.categoryGroups.map((g) => [g.label, g.models.length])).toEqual([
      ["Matrimonio", 2],
      [null, 1],
    ])
  })

  it("con groupBy su un campo esistente ma nessuna voce: nessun gruppo (mostra l'invito a creare la cartella)", () => {
    const seedWithCategory = { ...seed, branches: [makeBranch("title"), makeBranch("categoria")] } as Seed
    const { result } = renderHook(() => useContentGallery(seedWithCategory, [], "categoria"))
    expect(result.current.categoryAlias).toBe("categoria")
    expect(result.current.categoryGroups).toEqual([])
  })

  it("con groupBy che non corrisponde a nessun branch del seed: nessun gruppo", () => {
    const { result } = renderHook(() => useContentGallery(seed, data, "campo-inesistente"))
    expect(result.current.categoryAlias).toBeNull()
    expect(result.current.categoryGroups).toEqual([])
  })
})
