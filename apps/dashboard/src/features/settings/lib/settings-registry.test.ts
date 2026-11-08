// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { SETTINGS_ENTRIES, getVisibleSettingsEntries, resolveSettingsTab, TEAM_SECTIONS } from "./settings-registry"

const none = { canGlobally: () => false, canAnywhere: () => false }
const ids = (gates: Parameters<typeof getVisibleSettingsEntries>[0]) =>
  getVisibleSettingsEntries(gates).map((e) => e.id)

describe("settings registry", () => {
  it("has one entry per tab id", () => {
    const all = SETTINGS_ENTRIES.map((e) => e.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it("a caller with no authority sees only the personal tabs", () => {
    expect(ids(none)).toEqual(["profile", "security", "preferences", "connected-apps"])
  })

  it("manage_seeds opens nothing here: the content type builder is its own page", () => {
    expect(ids({ canGlobally: (p) => p === "manage_seeds", canAnywhere: () => true })).not.toContain("content-types")
  })

  it("manage_roles alone opens Team, with Roles as its only section", () => {
    const gates = { canGlobally: () => false, canAnywhere: (p: string) => p === "manage_roles" }
    expect(ids(gates)).toContain("team")
    expect(TEAM_SECTIONS.filter((s) => s.isVisible(gates)).map((s) => s.id)).toEqual(["roles"])
  })

  it("manage_users opens every Team section", () => {
    const gates = { canGlobally: () => false, canAnywhere: (p: string) => p === "manage_users" }
    expect(TEAM_SECTIONS.filter((s) => s.isVisible(gates)).map((s) => s.id)).toEqual(["users", "roles", "invitations"])
  })

  it("old links to merged tabs resolve to the tab that absorbed them", () => {
    expect(resolveSettingsTab("interface")).toBe("preferences")
    expect(resolveSettingsTab("notifications")).toBe("preferences")
    expect(resolveSettingsTab("roles")).toBe("team")
    expect(resolveSettingsTab("storage")).toBe("storage")
  })
})
