import { describe, it, expect } from "vitest"

import {
  getStatusBadgeVariant,
  resolveImageUrl,
  buildGalleryCardDisplayModel,
} from "@/features/content-gallery/gallery-card-display"
import type { ResolvedCardFields } from "@/features/content-gallery/resolve-card-fields"
import type { ContentEntry } from "@/lib/dynamic-columns"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: "entry-1",
    slug: "my-slug",
    status: "draft",
    data: {},
    ...overrides,
  } as ContentEntry
}

function makeBranch(alias: string, type = "text") {
  return { alias, type, label: alias } as any
}

const emptyBranches: ResolvedCardFields = {
  coverBranch: null,
  titleBranch: null,
  excerptBranch: null,
  dateBranch: null,
  tagsBranch: null,
}

// ---------------------------------------------------------------------------
// getStatusBadgeVariant
// ---------------------------------------------------------------------------

describe("getStatusBadgeVariant", () => {
  it('restituisce "secondary" per stringa vuota o solo spazi', () => {
    expect(getStatusBadgeVariant("")).toBe("secondary")
    expect(getStatusBadgeVariant("   ")).toBe("secondary")
  })

  it('restituisce "destructive" per stati negativi', () => {
    for (const status of ["error", "failed", "rejected", "archived"]) {
      expect(getStatusBadgeVariant(status)).toBe("destructive")
      // Case-insensitive
      expect(getStatusBadgeVariant(status.toUpperCase())).toBe("destructive")
    }
  })

  it('restituisce "default" per stati positivi', () => {
    for (const status of ["published", "active", "approved", "online"]) {
      expect(getStatusBadgeVariant(status)).toBe("default")
    }
  })

  it('restituisce "outline" per stati sconosciuti', () => {
    expect(getStatusBadgeVariant("draft")).toBe("outline")
    expect(getStatusBadgeVariant("pending")).toBe("outline")
    expect(getStatusBadgeVariant("in-review")).toBe("outline")
  })
})

// ---------------------------------------------------------------------------
// resolveImageUrl
// ---------------------------------------------------------------------------

describe("resolveImageUrl", () => {
  it("restituisce null per valori falsy", () => {
    expect(resolveImageUrl(null)).toBeNull()
    expect(resolveImageUrl(undefined)).toBeNull()
    expect(resolveImageUrl("")).toBeNull()
    expect(resolveImageUrl("   ")).toBeNull()
  })

  it("restituisce la stringa diretta se non è JSON", () => {
    expect(resolveImageUrl("https://example.com/image.jpg")).toBe(
      "https://example.com/image.jpg"
    )
  })

  it("risolve oggetti con campo url/src/path", () => {
    expect(resolveImageUrl({ url: "https://cdn.example.com/pic.png" })).toBe(
      "https://cdn.example.com/pic.png"
    )
    expect(resolveImageUrl({ src: "https://cdn.example.com/pic.png" })).toBe(
      "https://cdn.example.com/pic.png"
    )
    expect(resolveImageUrl({ path: "https://cdn.example.com/pic.png" })).toBe(
      "https://cdn.example.com/pic.png"
    )
  })

  it("risolve stringhe JSON che contengono un oggetto con url", () => {
    const json = JSON.stringify({ url: "https://cdn.example.com/pic.png" })
    expect(resolveImageUrl(json)).toBe("https://cdn.example.com/pic.png")
  })

  it("restituisce null per oggetti senza campi url/src/path", () => {
    expect(resolveImageUrl({ foo: "bar" })).toBeNull()
    expect(resolveImageUrl({})).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildGalleryCardDisplayModel
// ---------------------------------------------------------------------------

describe("buildGalleryCardDisplayModel", () => {
  it("costruisce un modello minimo con branchesFields vuoti", () => {
    const entry = makeEntry({ id: "e1", status: "draft", data: {} })
    const model = buildGalleryCardDisplayModel(entry, emptyBranches)

    expect(model.entryId).toBe("e1")
    expect(model.status).toBe("draft")
    expect(model.title).toBe("")
    expect(model.excerpt).toBe("")
    expect(model.imageUrl).toBeNull()
    expect(model.dateText).toBe("")
    expect(model.tags).toEqual([])
    expect(model.ariaLabel).toContain("e1")
  })

  it("imposta statusVariant in base allo status", () => {
    const model = buildGalleryCardDisplayModel(
      makeEntry({ status: "published" }),
      emptyBranches
    )
    expect(model.statusVariant).toBe("default")
  })

  it("segnala hasPendingDraft per entry pubblicate con bozza in sospeso", () => {
    const model = buildGalleryCardDisplayModel(
      makeEntry({ status: "published", has_pending_draft: true } as Partial<ContentEntry>),
      emptyBranches
    )

    expect(model.hasPendingDraft).toBe(true)
  })

  it("non segnala hasPendingDraft per entry archived", () => {
    const model = buildGalleryCardDisplayModel(
      makeEntry({ status: "archived", has_pending_draft: true } as Partial<ContentEntry>),
      emptyBranches
    )

    expect(model.hasPendingDraft).toBe(false)
  })

  it("popola title e ariaLabel dal branch corretto", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      titleBranch: makeBranch("title"),
    }
    const entry = makeEntry({ data: { title: "My Article" } })
    const model = buildGalleryCardDisplayModel(entry, branches)

    expect(model.title).toBe("My Article")
    expect(model.ariaLabel).toContain("My Article")
  })

  it("tronca l'excerpt a 90 caratteri con ellissi", () => {
    const longText = "A".repeat(100)
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      excerptBranch: makeBranch("body", "text"),
    }
    const entry = makeEntry({ data: { body: longText } })
    const model = buildGalleryCardDisplayModel(entry, branches)

    expect(model.excerpt.endsWith("…")).toBe(true)
    expect(model.excerpt.length).toBeLessThanOrEqual(91) // 90 chars + ellipsis
  })

  it("usa entry.slug come fallback per ariaLabel quando title è vuoto", () => {
    const entry = makeEntry({ id: "e2", slug: "my-slug", data: {} })
    const model = buildGalleryCardDisplayModel(entry, emptyBranches)
    expect(model.ariaLabel).toContain("e2")
  })

  it("popola imageUrl da coverBranch", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      coverBranch: makeBranch("cover", "file"),
    }
    const entry = makeEntry({ data: { cover: "https://cdn.example.com/img.jpg" } })
    const model = buildGalleryCardDisplayModel(entry, branches)
    expect(model.imageUrl).toBe("https://cdn.example.com/img.jpg")
  })

  it("usa '—' come status di fallback quando status è assente", () => {
    const entry = makeEntry({ status: undefined as any })
    const model = buildGalleryCardDisplayModel(entry, emptyBranches)
    expect(model.status).toBe("—")
  })

  it("converte numeri e booleani in testo per excerpt", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      excerptBranch: makeBranch("count", "text"),
    }
    const entryNum = makeEntry({ data: { count: 42 } })
    expect(buildGalleryCardDisplayModel(entryNum, branches).excerpt).toBe("42")

    const entryBool = makeEntry({ data: { count: true } })
    expect(buildGalleryCardDisplayModel(entryBool, branches).excerpt).toBe("true")
  })

  it("converte array in testo per excerpt (join con spazio)", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      excerptBranch: makeBranch("items", "text"),
    }
    const entry = makeEntry({ data: { items: ["alpha", "beta"] } })
    const model = buildGalleryCardDisplayModel(entry, branches)
    expect(model.excerpt).toContain("alpha")
    expect(model.excerpt).toContain("beta")
  })

  it("converte oggetti annidati in testo per excerpt", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      excerptBranch: makeBranch("meta", "text"),
    }
    const entry = makeEntry({ data: { meta: { description: "Nested value" } } })
    const model = buildGalleryCardDisplayModel(entry, branches)
    expect(model.excerpt).toContain("Nested value")
  })

  it("formatta date valide nel dateBranch", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      dateBranch: makeBranch("publishedAt", "date"),
    }
    const entry = makeEntry({ data: { publishedAt: "2024-03-15" } })
    const model = buildGalleryCardDisplayModel(entry, branches)
    expect(model.dateText).not.toBe("")
  })

  it("gestisce date invalide nel dateBranch con fallback al valore grezzo", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      dateBranch: makeBranch("publishedAt", "date"),
    }
    const entry = makeEntry({ data: { publishedAt: "not-a-date" } })
    const model = buildGalleryCardDisplayModel(entry, branches)
    // Invalid date: falls back to the raw string value
    expect(model.dateText).toBe("not-a-date")
  })

  it("rimuove tag HTML dall'excerpt", () => {
    const branches: ResolvedCardFields = {
      ...emptyBranches,
      excerptBranch: makeBranch("body", "richtext"),
    }
    const entry = makeEntry({ data: { body: "<p>Hello <strong>world</strong></p>" } })
    const model = buildGalleryCardDisplayModel(entry, branches)
    expect(model.excerpt).not.toContain("<p>")
    expect(model.excerpt).toContain("Hello")
    expect(model.excerpt).toContain("world")
  })
})
