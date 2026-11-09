// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import {
  SETTINGS_ENTRIES,
  getVisibleSections,
  getVisibleSettingsEntries,
  matchSettings,
  resolveSettingsTab,
  type SettingsGates,
} from "./settings-registry"

const none: SettingsGates = { canGlobally: () => false, canAnywhere: () => false }
const ids = (gates: SettingsGates) => getVisibleSettingsEntries(gates).map((e) => e.id)
const sectionIds = (tab: string, gates: SettingsGates) => {
  const entry = SETTINGS_ENTRIES.find((e) => e.id === tab)
  return entry ? getVisibleSections(entry, gates).map((s) => s.id) : []
}

describe("settings registry", () => {
  it("has one entry per tab id and unique bookmarks inside each", () => {
    const all = SETTINGS_ENTRIES.map((e) => e.id)
    expect(new Set(all).size).toBe(all.length)
    for (const entry of SETTINGS_ENTRIES) {
      const sections = entry.sections.map((s) => s.id)
      expect(new Set(sections).size).toBe(sections.length)
    }
  })

  it("a caller with no authority sees the personal families only", () => {
    expect(ids(none)).toEqual(["account", "notifications", "connected-apps", "appearance", "language"])
  })

  it("Site needs a global manage_users, Storage a global view_analytics", () => {
    expect(ids({ canGlobally: () => false, canAnywhere: () => true })).not.toContain("site")
    expect(ids({ canGlobally: (p) => p === "manage_users", canAnywhere: () => false })).toContain("site")
    expect(ids({ canGlobally: (p) => p === "view_analytics", canAnywhere: () => false })).toContain("storage")
  })

  it("the content type builder is not a setting", () => {
    const everything: SettingsGates = { canGlobally: () => true, canAnywhere: () => true }
    expect(ids(everything).join()).not.toMatch(/content-types|schema/)
  })

  it("manage_roles alone opens Users & roles with Roles as its only bookmark", () => {
    const gates: SettingsGates = { canGlobally: () => false, canAnywhere: (p) => p === "manage_roles" }
    expect(ids(gates)).toContain("people")
    expect(sectionIds("people", gates)).toEqual(["roles"])
  })

  it("manage_users lists Users, Roles and Invitations in page order", () => {
    const gates: SettingsGates = { canGlobally: () => false, canAnywhere: (p) => p === "manage_users" }
    expect(sectionIds("people", gates)).toEqual(["users", "roles", "invitations"])
  })

  it("old links to merged or renamed tabs resolve to the tab that took them over", () => {
    expect(resolveSettingsTab("profile")).toBe("account")
    expect(resolveSettingsTab("security")).toBe("account")
    expect(resolveSettingsTab("interface")).toBe("appearance")
    expect(resolveSettingsTab("general")).toBe("site")
    expect(resolveSettingsTab("roles")).toBe("people")
    expect(resolveSettingsTab("storage")).toBe("storage")
  })

  describe("matchSettings", () => {
    const everything: SettingsGates = { canGlobally: () => true, canAnywhere: () => true }
    const label = (_key: string, defaultLabel: string) => defaultLabel
    const find = (query: string, gates = everything) =>
      matchSettings(gates, query, label).map((m) => [m.entry.id, m.sections.map((s) => s.id)] as const)

    it("an empty query lists every visible entry with all its bookmarks", () => {
      expect(matchSettings(everything, "", label).map((m) => m.entry.id)).toEqual(getVisibleSettingsEntries(everything).map((e) => e.id))
    })

    it("an entry whose label matches keeps all its bookmarks", () => {
      expect(find("users & roles")).toEqual([["people", ["users", "roles", "invitations"]]])
    })

    it("a bookmark that matches shows alone under its entry", () => {
      expect(find("invitations")).toEqual([["people", ["invitations"]]])
      expect(find("password")).toEqual([["account", ["password"]]])
    })

    it("ignores case and accents", () => {
      const italian = (key: string, defaultLabel: string) => (key === "settings.sections.activity" ? "Attività recente" : defaultLabel)
      expect(matchSettings(everything, "ATTIVITA", italian).map((m) => [m.entry.id, m.sections.map((s) => s.id)])).toEqual([["account", ["activity"]]])
    })

    it("a keyword alone still finds the entry, with every bookmark", () => {
      expect(find("inviti")).toEqual([["people", ["users", "roles", "invitations"]]])
    })

    it("never surfaces what the caller may not open", () => {
      expect(find("inviti", none)).toEqual([])
    })
  })
})
