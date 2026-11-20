// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import type { Branch } from "@beechcms/core"
import { branchIssue, deriveAlias } from "@/features/seed-builder/lib/field-alias"

const field = (alias: string, extra: Partial<Branch> = {}): Branch => ({
  id: `br_new_${alias}`, alias, label: alias, type: "text", ...extra,
})

describe("deriveAlias", () => {
  it("turns a name into a snake_case alias", () => {
    expect(deriveAlias("Data di nascita", new Set())).toBe("data_di_nascita")
  })

  it("starts with a letter", () => {
    expect(deriveAlias("2nd address", new Set())).toBe("f_2nd_address")
  })

  it("never returns a reserved word", () => {
    expect(deriveAlias("Status", new Set())).toBe("status_2")
    expect(deriveAlias("ID", new Set())).toBe("id_2")
  })

  it("never returns an alias already in use", () => {
    expect(deriveAlias("Title", new Set(["title"]))).toBe("title_2")
    expect(deriveAlias("Title", new Set(["title", "title_2"]))).toBe("title_3")
  })

  it("gives an empty alias for a name with nothing usable", () => {
    expect(deriveAlias("???", new Set())).toBe("")
  })
})

describe("branchIssue", () => {
  it("accepts a complete field", () => {
    const title = field("title")
    expect(branchIssue(title, [title])).toBeNull()
  })

  it("names the first problem of an incomplete one", () => {
    expect(branchIssue(field(""), [])).toBe("alias")
    expect(branchIssue(field("Bad Alias"), [])).toBe("alias")
    expect(branchIssue(field("id"), [])).toBe("reserved")
    const a = field("title")
    const b = { ...field("title"), id: "br_new_other" }
    expect(branchIssue(a, [a, b])).toBe("duplicate")
    expect(branchIssue(field("owner", { type: "relation" }), [])).toBe("target")
  })
})
