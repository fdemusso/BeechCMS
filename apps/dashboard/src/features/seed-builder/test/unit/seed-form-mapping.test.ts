// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { Branch, Seed } from "@beechcms/core"
import { seedToFormData, formDataToSeed } from "@/features/seed-builder/lib/seed-form-mapping"
import type { SeedRecordDTO } from "@/features/seed-builder"

const branches: Branch[] = [
  { id: "br_01", alias: "title", label: "Title", type: "text" },
  { id: "br_02", alias: "body", label: "Body", type: "richtext" },
]

const record: SeedRecordDTO = {
  slug: "article",
  definition: {
    slug: "article",
    label: "Article",
    labelPlural: "Articles",
    displayNameAlias: "title",
    allowPublicRead: true,
    allowPublicPost: false,
    allowPublicEdit: true,
    allowDrafts: true,
    branches,
    dashboard: {
      icon: "FileText",
      group: "Content",
      order: 5,
      hidden: false,
      description: "Articles",
    },
  } as Seed,
  status: "active",
  source: "runtime",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

describe("seedToFormData", () => {
  it("flattens a Seed record into form aliases", () => {
    expect(seedToFormData(record)).toEqual({
      slug: "article",
      label: "Article",
      label_plural: "Articles",
      display_name_alias: "title",
      allow_public_read: true,
      allow_public_post: false,
      allow_public_edit: true,
      allow_drafts: true,
      branches,
      dash_icon: "FileText",
      dash_group: "Content",
      dash_order: 5,
      dash_hidden: false,
      dash_description: "Articles",
      dash_view_gallery: false,
      dash_view_kanban: false,
    })
  })

  it("returns empty defaults for create mode (null record)", () => {
    const formData = seedToFormData(null)
    expect(formData.slug).toBe("")
    expect(formData.branches).toEqual([])
    expect(formData.allow_drafts).toBe(false)
    expect(formData.dash_order).toBeUndefined()
  })
})

describe("formDataToSeed", () => {
  it("round-trips a flattened Seed back into the API shape", () => {
    const seed = formDataToSeed(seedToFormData(record))
    // views is always emitted by formDataToSeed (defaults to ['table'])
    expect(seed).toEqual({ ...record.definition, dashboard: { ...record.definition.dashboard, views: ['table'] } })
  })

  it("strips client-only ids from new branches (br_new_*)", () => {
    const newBranch: Branch = { id: "br_new_123", alias: "subtitle", label: "Subtitle", type: "text" }
    const seed = formDataToSeed({
      slug: "article",
      label: "Article",
      display_name_alias: "title",
      branches: [...branches, newBranch],
    })
    expect(seed.branches).toHaveLength(3)
    expect(seed.branches[2]).toEqual({ alias: "subtitle", label: "Subtitle", type: "text" })
    expect(seed.branches[2]).not.toHaveProperty("id")
  })

  it("keeps existing branch ids untouched", () => {
    const seed = formDataToSeed({ slug: "article", label: "Article", display_name_alias: "title", branches })
    expect(seed.branches).toEqual(branches)
  })
})
