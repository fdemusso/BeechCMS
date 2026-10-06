// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"

import { defaultCardConfig, resolveCardFields } from "@/features/content-gallery/resolve-card-fields"
import type { Branch, Seed } from "@beechcms/core"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBranch(alias: string, type: string): Branch {
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

// ---------------------------------------------------------------------------
// resolveCardFields
// ---------------------------------------------------------------------------

describe("resolveCardFields", () => {
  it("restituisce tutti null con branches vuoti", () => {
    const result = resolveCardFields(makeSeed([]))
    expect(result.coverBranch).toBeNull()
    expect(result.titleBranch).toBeNull()
    expect(result.excerptBranch).toBeNull()
    expect(result.dateBranch).toBeNull()
    expect(result.tagsBranch).toBeNull()
    expect(result.categoryBranch).toBeNull()
  })

  it("seleziona coverBranch dal primo branch file con alias 'cover'", () => {
    const branches = [
      makeBranch("description", "text"),
      makeBranch("cover", "file"),
      makeBranch("image", "file"),
    ]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.coverBranch?.alias).toBe("cover")
  })

  it("seleziona coverBranch anche con alias 'image'", () => {
    const branches = [makeBranch("image", "file")]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.coverBranch?.alias).toBe("image")
  })

  it("non seleziona coverBranch se nessun branch file ha alias con parola chiave", () => {
    const branches = [makeBranch("attachment", "file")]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.coverBranch).toBeNull()
  })

  it("seleziona titleBranch con alias 'title' o 'name'", () => {
    const branches = [makeBranch("title", "text"), makeBranch("body", "richtext")]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.titleBranch?.alias).toBe("title")
  })

  it("seleziona excerptBranch ignorando il titleBranch", () => {
    const branches = [
      makeBranch("title", "text"),
      makeBranch("body", "richtext"),
    ]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.excerptBranch?.alias).toBe("body")
  })

  it("seleziona dateBranch dal primo branch di tipo 'date'", () => {
    const branches = [makeBranch("publishedAt", "date")]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.dateBranch?.alias).toBe("publishedAt")
  })

  it("seleziona tagsBranch dal primo branch json con alias contenente 'tag'", () => {
    const branches = [makeBranch("tags", "json")]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.tagsBranch?.alias).toBe("tags")
  })

  it("non seleziona tagsBranch se il branch json non ha 'tag' nell'alias", () => {
    const branches = [makeBranch("metadata", "json")]
    const result = resolveCardFields(makeSeed(branches))
    expect(result.tagsBranch).toBeNull()
  })

  it("senza groupByAlias non seleziona categoryBranch, anche se un branch si chiama 'categoria'", () => {
    const result = resolveCardFields(
      makeSeed([makeBranch("title", "text"), makeBranch("categoria", "text")])
    )
    expect(result.categoryBranch).toBeNull()
  })

  it("seleziona categoryBranch per corrispondenza esatta con groupByAlias (lo stesso stato del 'Raggruppa per' della tabella)", () => {
    const result = resolveCardFields(
      makeSeed([makeBranch("title", "text"), makeBranch("categoria", "text")]),
      "categoria"
    )
    expect(result.categoryBranch?.alias).toBe("categoria")
  })

  it("non seleziona categoryBranch se groupByAlias non corrisponde a nessun branch del seed", () => {
    const result = resolveCardFields(makeSeed([makeBranch("categoria", "text")]), "altro-campo")
    expect(result.categoryBranch).toBeNull()
  })

  it("seleziona categoryBranch anche se il tipo non è text: il tipo è già stato validato da chi ha scelto il groupBy", () => {
    const result = resolveCardFields(makeSeed([makeBranch("priorita", "number")]), "priorita")
    expect(result.categoryBranch?.alias).toBe("priorita")
  })

  it("non usa il campo scelto come groupBy come excerpt", () => {
    const result = resolveCardFields(
      makeSeed([makeBranch("title", "text"), makeBranch("categoria", "text"), makeBranch("descrizione", "text")]),
      "categoria"
    )
    expect(result.excerptBranch?.alias).toBe("descrizione")
  })

  describe("con card personalizzata", () => {
    const withId = (id: string, alias: string, type: string) => ({ ...makeBranch(alias, type), id }) as Branch
    const seed = makeSeed([
      withId("br_01", "title", "text"),
      withId("br_02", "cover", "file"),
      withId("br_03", "summary", "text"),
      withId("br_04", "headline", "text"),
      withId("br_05", "author", "text"),
    ])

    it("ogni slot valorizzato sostituisce il campo dedotto per quello slot", () => {
      const result = resolveCardFields(seed, null, {
        version: 1,
        media: { branchId: "br_02" },
        header: { branchId: "br_04" },
        subtitle: { branchId: "br_05" },
        metadata: [],
      })

      expect(result.titleBranch?.alias).toBe("headline")
      expect(result.excerptBranch?.alias).toBe("author")
      expect(result.coverBranch?.alias).toBe("cover")
    })

    it("uno slot vuoto resta vuoto, senza tornare all'euristica", () => {
      const result = resolveCardFields(seed, null, { version: 1, header: { branchId: "br_04" }, metadata: [] })

      expect(result.titleBranch?.alias).toBe("headline")
      expect(result.coverBranch).toBeNull()
      expect(result.excerptBranch).toBeNull()
    })

    it("defaultCardConfig riproduce i campi dedotti, scartando quelli non offribili dal dialog", () => {
      const imageSeed = makeSeed([
        { ...withId("br_01", "title", "text") },
        { ...withId("br_02", "cover", "file"), fileOptions: { accept: "image" } } as Branch,
        withId("br_03", "summary", "text"),
        withId("br_04", "body", "richtext"),
      ])

      const config = defaultCardConfig(imageSeed)

      expect(config).toEqual({
        version: 1,
        media: { branchId: "br_02" },
        header: { branchId: "br_01" },
        subtitle: { branchId: "br_03" },
        metadata: [],
      })
      // un cover che non accetta immagini non è un valore valido per lo slot Media
      expect(defaultCardConfig(seed).media).toBeUndefined()
    })

    it("metadataBranches segue l'ordine della config e ignora branch inesistenti", () => {
      const result = resolveCardFields(seed, null, {
        version: 1,
        metadata: [{ branchId: "br_05" }, { branchId: "br_99" }, { branchId: "br_03" }],
      })

      expect(result.metadataBranches.map((b) => b.alias)).toEqual(["author", "summary"])
    })

    it("senza card metadataBranches è vuoto", () => {
      expect(resolveCardFields(seed).metadataBranches).toEqual([])
    })
  })
})
