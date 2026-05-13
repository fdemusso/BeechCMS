import { describe, it, expect } from "vitest"

import { resolveCardFields } from "@/features/content-gallery/resolve-card-fields"
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
})
