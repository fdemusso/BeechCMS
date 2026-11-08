// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { SETTINGS_ENTRIES, getVisibleSettingsEntries } from "./settings-registry"

const none = { canGlobally: () => false, canAnywhere: () => false }
const ids = (gates: Parameters<typeof getVisibleSettingsEntries>[0]) =>
  getVisibleSettingsEntries(gates).map((e) => e.id)

describe("settings registry", () => {
  it("has one entry per tab id", () => {
    const all = SETTINGS_ENTRIES.map((e) => e.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it("a caller with no authority sees only the personal tabs", () => {
    expect(ids(none)).toEqual(["profile", "security", "connected-apps", "notifications", "interface"])
  })

  it("manage_seeds opens nothing here: the content type builder is its own page", () => {
    expect(ids({ canGlobally: (p) => p === "manage_seeds", canAnywhere: () => true })).not.toContain("content-types")
  })

  it("manage_roles alone opens Roles but not Users or Invitations", () => {
    const visible = ids({ canGlobally: () => false, canAnywhere: (p) => p === "manage_roles" })
    expect(visible).toContain("roles")
    expect(visible).not.toContain("users")
    expect(visible).not.toContain("invitations")
  })
})
