// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import i18next from "i18next"
import en from "./en.json"
import it_ from "./it.json"
import es from "./es.json"
import de from "./de.json"
import fr from "./fr.json"
import enSource from "./en.json?raw"
import itSource from "./it.json?raw"
import esSource from "./es.json?raw"
import deSource from "./de.json?raw"
import frSource from "./fr.json?raw"
import glossary from "./glossary.json"

const TRANSLATIONS = { it: it_, es, de, fr } as const
const SOURCES = { en: enSource, it: itSource, es: esSource, de: deSource, fr: frSource } as const
const TRANSLATED = Object.keys(TRANSLATIONS) as Array<keyof typeof TRANSLATIONS>
const ALL_LOCALES = ["en", ...TRANSLATED] as const

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const GENERIC_VERBS = ["save", "cancel", "close", "back", "confirm", "delete"] as const

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

const flat: Record<(typeof ALL_LOCALES)[number], Record<string, string>> = {
  en: flatten(en),
  it: flatten(it_),
  es: flatten(es),
  de: flatten(de),
  fr: flatten(fr),
}

/** Keys with plural suffixes folded together: `x_one`, `x_other` and `x_many` are one entry, `x`. */
const pluralBases = (keys: string[]) => [...new Set(keys.map((key) => key.replace(PLURAL_SUFFIX, "")))].sort()

/** The English string a translated key answers to; a `_many` form (es, fr) mirrors the English `_other`. */
const englishFor = (key: string) => flat.en[key] ?? flat.en[key.replace(/_many$/, "_other")]

const multiset = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).sort().join("|")

describe("dashboard locales parity and coverage", () => {
  it.each(ALL_LOCALES)("%s: no object repeats a key, so no translation silently overwrites another", (locale) => {
    expect(duplicateKeys(SOURCES[locale])).toEqual([])
  })

  it("en.json contains required rbac invitation and role keys", () => {
    expect(en.rbac?.invitations?.copyLink).toBe("Copy invite link")
    expect(en.rbac?.invitations?.linkCopied).toBe("Invite link copied")
    expect(en.rbac?.roles?.moreRoles).toBe("+{{count}} more")
  })

  it("it.json contains required rbac invitation and role keys", () => {
    expect(it_.rbac?.invitations?.copyLink).toBe("Copia link di invito")
    expect(it_.rbac?.invitations?.linkCopied).toBe("Link di invito copiato")
    expect(it_.rbac?.roles?.moreRoles).toBe("+{{count}} altri")
  })

  describe("every locale answers the same keys as en.json", () => {
    it.each(TRANSLATED)("%s has no missing and no extra key, plural forms aside", (locale) => {
      expect(pluralBases(Object.keys(flat[locale]))).toEqual(pluralBases(Object.keys(flat.en)))
    })

    it.each(ALL_LOCALES)("%s gives every plural key an _other form, the one i18next falls back to", (locale) => {
      const plural = Object.keys(flat[locale]).filter((key) => PLURAL_SUFFIX.test(key))
      const withoutOther = pluralBases(plural).filter((base) => !(`${base}_other` in flat[locale]))
      expect(withoutOther).toEqual([])
    })

    it.each(TRANSLATED)("%s keeps every {{variable}} of the English string", (locale) => {
      const drifted = Object.entries(flat[locale])
        .filter(([key, value]) => multiset(value, /\{\{[^}]+\}\}/g) !== multiset(englishFor(key) ?? "", /\{\{[^}]+\}\}/g))
        .map(([key]) => key)
      expect(drifted).toEqual([])
    })

    it.each(TRANSLATED)("%s keeps every <tag> of the English string, so <Trans> still finds its slots", (locale) => {
      const drifted = Object.entries(flat[locale])
        .filter(([key, value]) => multiset(value, /<\/?[a-z]+>/g) !== multiset(englishFor(key) ?? "", /<\/?[a-z]+>/g))
        .map(([key]) => key)
      expect(drifted).toEqual([])
    })

    it.each(TRANSLATED)("%s has no empty string", (locale) => {
      expect(Object.entries(flat[locale]).filter(([, value]) => !value.trim()).map(([key]) => key)).toEqual([])
    })
  })

  describe("glossary: hard_dnt terms survive translation", () => {
    it("every term is atomic (no slash lists) and has a reason", () => {
      for (const entry of glossary.hard_dnt) {
        expect(entry.term, entry.term).not.toMatch(/[/,]/)
        expect(entry.reason.length, entry.term).toBeGreaterThan(0)
      }
      for (const entry of glossary.soft_dnt) {
        expect(entry.term, entry.term).not.toMatch(/[/,]/)
        expect(entry.translation_note.length, entry.term).toBeGreaterThan(0)
      }
    })

    describe.each(TRANSLATED)("%s", (locale) => {
      it.each(glossary.hard_dnt.map((entry) => entry.term))("%s stays verbatim wherever the English string uses it", (term) => {
        // Word boundary, case-sensitive; Cron is the one case-insensitive term ("Espressione cron").
        const pattern = new RegExp(`\\b${term}\\b`, term === "Cron" ? "i" : "")
        const lost = Object.entries(flat.en)
          .filter(([key, value]) => pattern.test(value) && !pattern.test(flat[locale][key] ?? ""))
          .map(([key]) => key)
        expect(lost).toEqual([])
      })
    })
  })

  describe("interpolation syntax", () => {
    it.each(ALL_LOCALES)("%s: no string uses a single-brace {variable}: i18next and the automation engine both want {{variable}}", (locale) => {
      const single = /(?<!\{)\{[A-Za-z_]\w*\}(?!\})/
      expect(Object.entries(flat[locale]).filter(([, value]) => single.test(value)).map(([key]) => key)).toEqual([])
    })

    it.each(ALL_LOCALES)("%s: automation template examples render the literal {{token}} the engine expects", async (locale) => {
      const i18n = i18next.createInstance()
      const tree = { en, ...TRANSLATIONS }[locale]
      await i18n.init({ lng: locale, resources: { [locale]: { translation: tree } }, interpolation: { escapeValue: false } })

      const hint = i18n.t("automations.actions.templateHint", { example: "{{fieldAlias}}" })
      const subject = i18n.t("automations.actions.mailSubject.placeholder", { example: "{{title}}" })

      expect(hint).toContain("{{fieldAlias}}")
      expect(subject).toContain("{{title}}")
    })
  })

  describe("key conventions", () => {
    it.each(ALL_LOCALES)("%s: no key is nested deeper than 5 levels (<domain>.<surface>.<element>.<role>)", (locale) => {
      const tooDeep = Object.keys(flat[locale]).filter((key) => key.split(".").length > 5)
      expect(tooDeep).toEqual([])
    })

    it.each(ALL_LOCALES)("%s: the generic UI verbs live in common.action and nowhere else", (locale) => {
      const copies = GENERIC_VERBS.flatMap((verb) => {
        const home = `common.action.${verb}`
        return Object.keys(flat.en).filter(
          (key) => key !== home && flat.en[key] === flat.en[home] && flat[locale][key] === flat[locale][home]
        )
      })
      expect(copies).toEqual([])
    })

    it.each(ALL_LOCALES)("%s: literal {{...}} template tokens stay untouched in the automation hints", (locale) => {
      const actions = flat[locale]
      expect(actions["automations.actions.hintFixed"]).toContain("{{varname}}")
      expect(actions["automations.actions.hintCollection"]).toContain("{{varname.firstone.field}}")
      expect(actions["automations.actions.filterTemplateHint"]).toContain("{{this.field}}")
    })
  })
})
