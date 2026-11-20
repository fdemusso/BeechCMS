// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { resolveClassification, validateSeedDefinitions } from "@beechcms/core"
import type { Branch, Seed } from "@beechcms/core"
import { SEED_TEMPLATE_IDS, buildTemplate } from "@/features/seed-builder/lib/seed-templates"
import { areBranchesComplete } from "@/features/seed-builder/hooks/use-seed-form"
import en from "@/locales/en.json"
import itLocale from "@/locales/it.json"

const label = (templateId: string, alias: string) => `${templateId}.${alias}`

/** The server replaces client-only ids with real ones on save; mimic that to validate the definition. */
function asSeed(id: string, branches: Branch[], displayNameAlias: string): Seed {
  return {
    slug: id,
    label: id,
    displayNameAlias,
    branches: branches.map((b, i) => ({ ...b, id: `br_${i + 1}` })),
  }
}

describe.each(SEED_TEMPLATE_IDS)("template %s", (id) => {
  const template = buildTemplate(id, label)

  it("passes the core seed validation with no issue", () => {
    expect(validateSeedDefinitions([asSeed(id, template.branches, template.displayNameAlias)])).toEqual([])
  })

  it("is complete: every field has a valid, unique alias", () => {
    expect(areBranchesComplete(template.branches)).toBe(true)
  })

  it("names its display field among its own fields", () => {
    expect(template.branches.map((b) => b.alias)).toContain(template.displayNameAlias)
  })

  it("uses client-only ids, unique within the template", () => {
    const ids = template.branches.map((b) => b.id)
    expect(ids.every((value) => value.startsWith("br_new_"))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("has a translated name and field labels in both languages", () => {
    for (const locale of [en, itLocale]) {
      const strings = (locale as unknown as { seedBuilder: { templates: Record<string, Record<string, string>> } })
        .seedBuilder.templates[id]
      expect(strings.name).toBeTruthy()
      for (const branch of template.branches) expect(strings[branch.alias], branch.alias).toBeTruthy()
    }
  })
})

describe("personal data", () => {
  it("keeps every contact detail of a person encrypted and out of the public API", () => {
    const { branches } = buildTemplate("person", label)
    for (const alias of ["email", "phone", "tax_id", "address"]) {
      const resolved = resolveClassification(branches.find((b) => b.alias === alias)!)
      expect(resolved.classification, alias).toBe("confidential")
      expect(resolved.publicVisibility, alias).toBe("hidden")
    }
  })

  it("never leaves a field of a person public", () => {
    const { branches } = buildTemplate("person", label)
    for (const branch of branches) expect(resolveClassification(branch).classification, branch.alias).not.toBe("public")
  })

  it("does not stage sensitive records as drafts", () => {
    expect(buildTemplate("person", label).allowDrafts).toBe(false)
    expect(buildTemplate("contact", label).allowDrafts).toBe(false)
  })
})
