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
import type { SystemHealth } from "@/features/dashboard"
import {
  getVisibleSettingsEntries,
  NOTIFICATION_PREF_ITEMS,
  type DashboardLanguage,
  type NotificationPrefToggle,
} from "@/features/settings"
import {
  createContentTypesProvider,
  createPreferencesProvider,
  createSettingsProvider,
  createSystemStatusProvider,
} from "./palette-providers"

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

  it("answers the > prefix", () => {
    const provider = createSettingsProvider({ t, openSettings: vi.fn() })

    expect(provider.prefix).toBe(">")
  })
})

describe("createPreferencesProvider", () => {
  // `mediaUpload` is deliberately absent: the server stores nothing for it, so its fallback shows.
  const STORED_PREFS: NonNullable<NotificationPrefToggle["prefs"]> = {
    contentCreate: true,
    contentUpdate: true,
    contentDelete: false,
  } as NonNullable<NotificationPrefToggle["prefs"]>

  function itemsFor(options: {
    query?: string
    prefix?: ">"
    language?: string
    setLanguage?: (language: DashboardLanguage) => void
    notifications?: Partial<NotificationPrefToggle>
  }): readonly PaletteItem[] {
    const notifications: NotificationPrefToggle = {
      prefs: STORED_PREFS,
      isLoading: false,
      isError: false,
      isSaving: false,
      setPref: vi.fn().mockResolvedValue(undefined),
      ...options.notifications,
    }
    const provider = createPreferencesProvider({
      t,
      language: options.language ?? "it",
      setLanguage: options.setLanguage ?? vi.fn(),
      notifications,
    })
    return provider.getItems({
      page: "root",
      query: options.query ?? "",
      prefix: options.prefix,
      permissions: permissionsFor({}),
    })
  }

  const notificationRows = (items: readonly PaletteItem[]) => items.filter((item) => item.id.startsWith("prefs:notify:"))

  it("emits nothing on the idle root without a prefix", () => {
    const items = itemsFor({})

    expect(items).toEqual([])
  })

  it("with the > prefix lists one row per other language, then one row per notification switch", () => {
    const items = itemsFor({ prefix: ">", language: "it" })

    expect(items.map((item) => item.id)).toEqual([
      "prefs:language:en",
      ...NOTIFICATION_PREF_ITEMS.map(({ key }) => `prefs:notify:${key}`),
    ])
  })

  it("the language row switches through setLanguage to its language", () => {
    const setLanguage = vi.fn()
    const englishRow = itemsFor({ prefix: ">", language: "it", setLanguage }).find((item) => item.id === "prefs:language:en")

    runItem(englishRow)

    expect(setLanguage).toHaveBeenCalledExactlyOnceWith("en")
  })

  it("a notification row shows its current value and saves the opposite", () => {
    const setPref = vi.fn().mockResolvedValue(undefined)
    const rows = notificationRows(itemsFor({ prefix: ">", notifications: { setPref } }))
    const expected = NOTIFICATION_PREF_ITEMS.map(({ key, fallback }) => [key, !(STORED_PREFS[key] ?? fallback)])

    for (const row of rows) runItem(row)

    expect(rows.map((row) => row.description)).toEqual(
      NOTIFICATION_PREF_ITEMS.map(({ key, fallback }) =>
        STORED_PREFS[key] ?? fallback ? "commandPalette.preferences.on" : "commandPalette.preferences.off",
      ),
    )
    expect(setPref.mock.calls).toEqual(expected)
  })

  it("a key the server has not stored shows its fallback", () => {
    const mediaRow = itemsFor({ prefix: ">" }).find((item) => item.id === "prefs:notify:mediaUpload")

    expect(mediaRow?.description).toBe("commandPalette.preferences.off")
  })

  it("while the prefs are not loaded every notification row is disabled with the loading reason", () => {
    const rows = notificationRows(itemsFor({ prefix: ">", notifications: { prefs: undefined, isLoading: true } }))

    expect(rows).toHaveLength(NOTIFICATION_PREF_ITEMS.length)
    expect(rows.every((row) => row.unavailableReason === "common.loading")).toBe(true)
  })

  it("after a failed load every notification row is disabled with the unavailable reason", () => {
    const rows = notificationRows(itemsFor({ prefix: ">", notifications: { prefs: undefined, isError: true } }))

    expect(rows.every((row) => row.unavailableReason === "commandPalette.preferences.notifyUnavailable")).toBe(true)
  })

  it("while a save is in flight every notification row is disabled with the saving reason", () => {
    const rows = notificationRows(itemsFor({ prefix: ">", notifications: { isSaving: true } }))

    expect(rows.every((row) => row.unavailableReason === "commandPalette.preferences.saving")).toBe(true)
  })
})

describe("createSystemStatusProvider", () => {
  const HEALTH: SystemHealth = {
    storage: { used: 40, limit: 100, percentage: 40 },
    database: { requests30d: 10, limit: 100, percentage: 10 },
    status: "healthy",
    lastUpdate: 1_700_000_000,
  }

  function itemsFor(options: {
    payload?: PermissionsPayload
    prefix?: ">"
    health?: { data: SystemHealth | undefined; isError: boolean }
  }): readonly PaletteItem[] {
    const provider = createSystemStatusProvider({ t, health: options.health ?? { data: HEALTH, isError: false } })
    return provider.getItems({
      page: "root",
      query: "",
      prefix: options.prefix,
      permissions: permissionsFor(options.payload ?? { global: ["view_analytics"] }),
    })
  }

  it("emits nothing without view_analytics on *, even when it is granted on a seed", () => {
    const items = itemsFor({ payload: { byScope: { posts: ["view_analytics"] } }, prefix: ">" })

    expect(items).toEqual([])
  })

  it("emits nothing on the idle root without a prefix", () => {
    const items = itemsFor({})

    expect(items).toEqual([])
  })

  it("describes the quotas and copies that description on Enter", () => {
    const verdicts = [
      ["healthy", "commandPalette.system.statusHealthy"],
      ["warning", "commandPalette.system.statusWarning"],
    ] as const

    for (const [status, expectedKey] of verdicts) {
      const [row] = itemsFor({ prefix: ">", health: { data: { ...HEALTH, status }, isError: false } })

      expect(row.description).toBe(expectedKey)
      expect(row.perform).toEqual({ kind: "copy", value: expectedKey })
    }
  })

  it("is disabled with the loading reason before data and with the unavailable reason after an error", () => {
    const [loadingRow] = itemsFor({ prefix: ">", health: { data: undefined, isError: false } })
    const [failedRow] = itemsFor({ prefix: ">", health: { data: undefined, isError: true } })

    expect(loadingRow.unavailableReason).toBe("common.loading")
    expect(failedRow.unavailableReason).toBe("commandPalette.system.statusUnavailable")
  })
})
