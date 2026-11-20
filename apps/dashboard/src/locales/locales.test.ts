// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { describe, it, expect } from "vitest"
import en from "./en.json"
import itJson from "./it.json"
import enSource from "./en.json?raw"
import itSource from "./it.json?raw"
import glossary from "./glossary.json"
import i18next from "i18next"

/** Every key that appears twice in the same object: JSON.parse keeps the last one and drops the other without a word. */
function duplicateKeys(text: string): string[] {
  const stack: Array<Set<string>> = []
  const duplicates: string[] = []
  // A string (a key if a colon follows it) or a brace; strings are taken whole, so braces inside them are never seen.
  for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"(\s*:)?|([{}])/g)) {
    if (match[3] === "{") stack.push(new Set())
    else if (match[3] === "}") stack.pop()
    else if (match[2] !== undefined && stack.length > 0) {
      const keys = stack[stack.length - 1]
      if (keys.has(match[1])) duplicates.push(match[1])
      keys.add(match[1])
    }
  }
  return duplicates
}

/** Leaf paths of a locale tree, `a.b.c` -> string. */
function flatten(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out[path] = value
    else if (value && typeof value === "object") flatten(value, path, out)
  }
  return out
}

describe("dashboard locales parity and coverage", () => {
  it("no object repeats a key, so no translation silently overwrites another", () => {
    expect(duplicateKeys(enSource)).toEqual([])
    expect(duplicateKeys(itSource)).toEqual([])
  })

  it("en.json contains required rbac invitation and role keys", () => {
    expect(en.rbac?.invitations?.copyLink).toBe("Copy invite link")
    expect(en.rbac?.invitations?.linkCopied).toBe("Invite link copied")
    expect(en.rbac?.roles?.moreRoles).toBe("+{{count}} more")
  })

  it("it.json contains required rbac invitation and role keys", () => {
    expect(itJson.rbac?.invitations?.copyLink).toBe("Copia link di invito")
    expect(itJson.rbac?.invitations?.linkCopied).toBe("Link di invito copiato")
    expect(itJson.rbac?.roles?.moreRoles).toBe("+{{count}} altri")
  })

  describe("glossary: hard_dnt terms survive translation", () => {
    const enFlat = flatten(en)
    const itFlat = flatten(itJson)

    it("every term is atomic (no slash lists) and has a reason", () => {
      for (const entry of glossary.hard_dnt) {
        expect(entry.term, entry.term).not.toMatch(/[\/,]/)
        expect(entry.reason.length, entry.term).toBeGreaterThan(0)
      }
      for (const entry of glossary.soft_dnt) {
        expect(entry.term, entry.term).not.toMatch(/[\/,]/)
        expect(entry.translation_note.length, entry.term).toBeGreaterThan(0)
      }
    })

    it.each(glossary.hard_dnt.map((entry) => entry.term))("%s stays verbatim wherever the English string uses it", (term) => {
      // Word boundary, case-sensitive; Cron is the one case-insensitive term ("Espressione cron").
      const pattern = new RegExp(`\\b${term}\\b`, term === "Cron" ? "i" : "")
      const lost = Object.entries(enFlat)
        .filter(([key, value]) => pattern.test(value) && !pattern.test(itFlat[key] ?? ""))
        .map(([key]) => key)
      expect(lost).toEqual([])
    })
  })

  describe("interpolation syntax", () => {
    it("no string uses a single-brace {variable}: i18next and the automation engine both want {{variable}}", () => {
      const single = /(?<!\{)\{[A-Za-z_]\w*\}(?!\})/
      for (const flat of [flatten(en), flatten(itJson)]) {
        expect(Object.entries(flat).filter(([, value]) => single.test(value)).map(([key]) => key)).toEqual([])
      }
    })

    it("automation template examples render the literal {{token}} the engine expects", async () => {
      const i18n = i18next.createInstance()
      await i18n.init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } })
      expect(i18n.t("automations.actions.templateHint", { example: "{{fieldAlias}}" })).toBe("Use {{fieldAlias}} to insert field values")
      expect(i18n.t("automations.actions.mailSubject.placeholder", { example: "{{title}}" })).toBe("New entry: {{title}}")
    })
  })

  describe("key conventions", () => {
    const enFlat = flatten(en)
    const itFlat = flatten(itJson)
    const GENERIC_VERBS = ["save", "cancel", "close", "back", "confirm", "delete"] as const

    it("no key is nested deeper than 5 levels (<domain>.<surface>.<element>.<role>)", () => {
      const tooDeep = Object.keys(enFlat).filter((key) => key.split(".").length > 5)
      expect(tooDeep).toEqual([])
    })

    it("the generic UI verbs live in common.action and nowhere else", () => {
      for (const verb of GENERIC_VERBS) {
        const home = `common.action.${verb}`
        expect(enFlat[home], home).toBeTruthy()
        expect(itFlat[home], home).toBeTruthy()
        const copies = Object.keys(enFlat).filter(
          (key) => key !== home && enFlat[key] === enFlat[home] && itFlat[key] === itFlat[home]
        )
        expect(copies, `copies of ${home}`).toEqual([])
      }
    })

    it("literal {{...}} template tokens stay untouched in the automation hints", () => {
      const actions = en.automations.actions as Record<string, string>
      expect(actions.hintFixed).toContain("{{varname}}")
      expect(actions.hintCollection).toContain("{{varname.firstone.field}}")
      expect(actions.filterTemplateHint).toContain("{{this.field}}")
    })
  })
})
