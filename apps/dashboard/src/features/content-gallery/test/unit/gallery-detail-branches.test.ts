// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"

import {
  isSeoBranch,
  isTagsBranch,
  isTitleBranch,
  partitionGalleryDetailBranches,
  splitMainRichtext,
} from "@/features/content-gallery/gallery-detail-branches"
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
// Predicate helpers
// ---------------------------------------------------------------------------

describe("isSeoBranch", () => {
  it("returns true for aliases starting with 'meta'", () => {
    expect(isSeoBranch(makeBranch("metaTitle", "text"))).toBe(true)
    expect(isSeoBranch(makeBranch("metaDescription", "text"))).toBe(true)
  })

  it("returns false for unrelated aliases", () => {
    expect(isSeoBranch(makeBranch("title", "text"))).toBe(false)
    expect(isSeoBranch(makeBranch("body", "richtext"))).toBe(false)
  })
})

describe("isTagsBranch", () => {
  it("returns true for json branches with 'tag' in alias", () => {
    expect(isTagsBranch(makeBranch("tags", "json"))).toBe(true)
    expect(isTagsBranch(makeBranch("productTags", "json"))).toBe(true)
  })

  it("returns false for non-json branches", () => {
    expect(isTagsBranch(makeBranch("tags", "text"))).toBe(false)
  })

  it("returns false for json branches without 'tag' in alias", () => {
    expect(isTagsBranch(makeBranch("metadata", "json"))).toBe(false)
  })
})

describe("isTitleBranch", () => {
  it("returns true for alias 'title' or 'name' (case-insensitive)", () => {
    expect(isTitleBranch(makeBranch("title", "text"))).toBe(true)
    expect(isTitleBranch(makeBranch("name", "text"))).toBe(true)
    expect(isTitleBranch(makeBranch("TITLE", "text"))).toBe(true)
  })

  it("returns false for other aliases", () => {
    expect(isTitleBranch(makeBranch("headline", "text"))).toBe(false)
    expect(isTitleBranch(makeBranch("body", "richtext"))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// partitionGalleryDetailBranches
// ---------------------------------------------------------------------------

describe("partitionGalleryDetailBranches", () => {
  it("partiziona correttamente tags, seo e main branches", () => {
    const branches = [
      makeBranch("title", "text"),
      makeBranch("body", "richtext"),
      makeBranch("tags", "json"),
      makeBranch("metaTitle", "text"),
      makeBranch("metaDescription", "text"),
      makeBranch("publishedAt", "date"),
    ]
    const seed = makeSeed(branches)
    const result = partitionGalleryDetailBranches(seed)

    expect(result.tagsBranch?.alias).toBe("tags")
    expect(result.seoBranches.map((b) => b.alias)).toEqual([
      "metaTitle",
      "metaDescription",
    ])
    // title is excluded by isTitleBranch; tags and seo already partitioned
    expect(result.mainBranches.map((b) => b.alias)).toEqual([
      "body",
      "publishedAt",
    ])
  })

  it("restituisce tagsBranch null e mainBranches completo senza branch json-tag", () => {
    const branches = [makeBranch("title", "text"), makeBranch("body", "richtext")]
    const result = partitionGalleryDetailBranches(makeSeed(branches))

    expect(result.tagsBranch).toBeNull()
    // title excluded by isTitleBranch
    expect(result.mainBranches.map((b) => b.alias)).toEqual(["body"])
    expect(result.seoBranches).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// splitMainRichtext
// ---------------------------------------------------------------------------

describe("splitMainRichtext", () => {
  it("separa il primo branch richtext dagli altri", () => {
    const branches = [
      makeBranch("body", "richtext"),
      makeBranch("summary", "text"),
    ]
    const result = splitMainRichtext(branches)
    expect(result.richtextBranch?.alias).toBe("body")
    expect(result.otherMainBranches.map((b) => b.alias)).toEqual(["summary"])
  })

  it("restituisce richtextBranch null se non ci sono branch richtext", () => {
    const branches = [makeBranch("title", "text")]
    const result = splitMainRichtext(branches)
    expect(result.richtextBranch).toBeNull()
    expect(result.otherMainBranches).toHaveLength(1)
  })
})
