// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import type { Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"
import { categoryKey } from "@/features/content-gallery/group-by-category"
import { folderCreateDefaults, UNCATEGORIZED_PARAM } from "@/features/content-gallery/folder-create-defaults"

const posts = CANONICAL_SEEDS.find((seed) => seed.slug === "posts") as Seed

function entry(data: Record<string, unknown>): ContentEntry {
  return { id: "e1", slug: "e1", data, status: "draft" } as ContentEntry
}

describe("folderCreateDefaults", () => {
  it("prefills a tags group-by field with a one-element array", () => {
    const data = [entry({ title: "A", priority: ["high"] })]

    const defaults = folderCreateDefaults(posts, data, "priority", categoryKey("high"))

    expect(defaults).toEqual({ priority: ["high"] })
  })

  it("prefills a text group-by field with the folder label", () => {
    const data = [entry({ title: "Wedding" })]

    const defaults = folderCreateDefaults(posts, data, "title", categoryKey("Wedding"))

    expect(defaults).toEqual({ title: "Wedding" })
  })

  it("returns undefined for the uncategorized folder", () => {
    const data = [entry({ title: "A", priority: ["high"] })]

    const defaults = folderCreateDefaults(posts, data, "priority", UNCATEGORIZED_PARAM)

    expect(defaults).toBeUndefined()
  })
})
