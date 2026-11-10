// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import type { TFunction } from "i18next"
import { CANONICAL_SEEDS } from "@beechcms/testing"
import {
  GLOBAL_SCOPE,
  SYSTEM_SEED_SLUGS,
  hasPermission,
  hasPermissionAnywhere,
  isSystemSeedSlug,
  type Seed,
} from "@beechcms/core"
import { hydrateEffectivePermissions } from "@/features/shared"
import type { CommandPage, PaletteItem, PalettePermissions } from "@/features/command-palette"
import { SEED_INTENT_NEW } from "@/features/seed-builder"
import { getVisibleSettingsEntries } from "@/features/settings"
import { createContentTypesProvider, createSettingsProvider } from "./palette-providers"

type PermissionsPayload = Parameters<typeof hydrateEffectivePermissions>[0]

function permissionsFor(payload: PermissionsPayload): PalettePermissions {
  const effective = hydrateEffectivePermissions(payload)
  return {
    can: (permission, scope) => hasPermission(effective, permission, scope),
    canAnywhere: (permission) => hasPermissionAnywhere(effective, permission),
    canGlobally: (permission) => hasPermission(effective, permission, GLOBAL_SCOPE),
  }
}

const t = ((key: string, optionsOrDefault?: unknown) =>
  typeof optionsOrDefault === "string" ? optionsOrDefault : key) as unknown as TFunction

const MANAGE_SEEDS_GLOBALLY: PermissionsPayload = { global: ["manage_seeds"] }

function runItem(item: PaletteItem | undefined): void {
  if (item?.perform.kind !== "run") throw new Error(`item ${item?.id} is not a run item`)
  item.perform.run()
}

describe("createContentTypesProvider", () => {
  // A system seed is not part of CANONICAL_SEEDS, so one is derived from a canonical seed.
  const systemSeed: Seed = { ...CANONICAL_SEEDS[0], slug: SYSTEM_SEED_SLUGS[0] }

  function itemsFor(payload: PermissionsPayload, openBuilder = vi.fn(), page: CommandPage = "root"): readonly PaletteItem[] {
    const provider = createContentTypesProvider({ t, seeds: [...CANONICAL_SEEDS, systemSeed], openBuilder })
    return provider.getItems({ page, query: "", permissions: permissionsFor(payload) })
  }

  it("emits nothing without manage_seeds on *", () => {
    const items = itemsFor({ byScope: { posts: ["manage_seeds"] } })

    expect(items).toEqual([])
  })

  it("never lists a system seed", () => {
    const items = itemsFor(MANAGE_SEEDS_GLOBALLY, vi.fn(), "edit-schema")

    const slugs = items.map((item) => item.id.replace("schema:edit:", ""))
    expect(slugs).toEqual(CANONICAL_SEEDS.map((seed) => seed.slug))
    expect(slugs.some((slug) => isSystemSeedSlug(slug))).toBe(false)
  })

  it("selecting New content type calls openBuilder with SEED_INTENT_NEW", () => {
    const openBuilder = vi.fn()
    const newTypeRow = itemsFor(MANAGE_SEEDS_GLOBALLY, openBuilder).find((item) => item.id === "schema:new")

    runItem(newTypeRow)

    expect(openBuilder).toHaveBeenCalledExactlyOnceWith(SEED_INTENT_NEW)
  })
})

describe("createSettingsProvider", () => {
  function itemsFor(payload: PermissionsPayload, query: string, openSettings = vi.fn()): readonly PaletteItem[] {
    const provider = createSettingsProvider({ t, openSettings })
    return provider.getItems({ page: "root", query, permissions: permissionsFor(payload) })
  }

  it("the idle root page emits no rows", () => {
    const items = itemsFor({}, "")

    expect(items).toEqual([])
  })

  it("typing emits tab and section rows only for entries getVisibleSettingsEntries returns for those permissions", () => {
    const payload: PermissionsPayload = { global: ["manage_users"] }
    const permissions = permissionsFor(payload)
    const visibleTabIds = getVisibleSettingsEntries(permissions).map((entry) => entry.id)

    const items = itemsFor(payload, "s")

    const emittedTabIds = new Set(items.map((item) => item.id.split(":")[1]))
    expect([...emittedTabIds].sort()).toEqual([...visibleTabIds].sort())
  })

  it("a section row's run calls openSettings with the section id", () => {
    const openSettings = vi.fn()
    const items = itemsFor({}, "theme", openSettings)
    const themeRow = items.find((item) => item.id === "settings:appearance:theme")

    runItem(themeRow)

    expect(openSettings).toHaveBeenCalledExactlyOnceWith("appearance", { section: "theme" })
  })
})
