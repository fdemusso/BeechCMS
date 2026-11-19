// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// Composition root — palette providers that need the public API of other feature slices.

import { isSystemSeedSlug, type Seed } from "@beechcms/core"
import type { TFunction } from "i18next"
import { Bell, Language, Layers, Plus, Pulse } from "@/components/icons"
import type { CommandPage, PaletteItem, PalettePermissions, PaletteProvider } from "@/features/command-palette"
import type { SystemHealth } from "@/features/dashboard"
import { SEED_INTENT_NEW } from "@/features/seed-builder"
import {
  DASHBOARD_LANGUAGES,
  getVisibleSections,
  getVisibleSettingsEntries,
  NOTIFICATION_PREF_ITEMS,
  SETTINGS_GROUP_LABELS,
  SETTINGS_GROUP_ORDER,
  useSettingsDialog,
  type DashboardLanguage,
} from "@/features/settings"
import { resolveIcon } from "@/lib/icon-registry"
import { ALT_KEY_LABEL, SHIFT_KEY_LABEL } from "@/lib/platform"

/**
 * Settings tabs and the bookmarks inside them, shown only to callers the settings registry lets in.
 * Idle on the root page nothing is emitted: the navigation provider's "Settings…" row opens the settings page.
 */
export function createSettingsProvider(deps: {
  t: TFunction
  openSettings: ReturnType<typeof useSettingsDialog>["openSettings"]
}): PaletteProvider {
  const { t, openSettings } = deps

  const rowsFor = (permissions: PalettePermissions, page: CommandPage): PaletteItem[] => {
    const gates = { canGlobally: permissions.canGlobally, canAnywhere: permissions.canAnywhere }
    const entries = getVisibleSettingsEntries(gates)
    const items: PaletteItem[] = []

    for (const groupId of SETTINGS_GROUP_ORDER) {
      const group = SETTINGS_GROUP_LABELS[groupId]
      const section = `${t("commandPalette.settings")} · ${t(group.key, group.defaultLabel)}`

      for (const entry of entries.filter((candidate) => candidate.groupId === groupId)) {
        const label = t(entry.labelKey, entry.defaultLabel)
        items.push({
          id: `settings:${entry.id}`,
          section,
          label,
          icon: entry.icon,
          keywords: [...entry.keywords, entry.id, t("commandPalette.settings")],
          perform: { kind: "run", run: () => openSettings(entry.id) },
        })
        if (page !== "root") continue

        // A bookmark is a hit of its own while typing ("inviti", "password").
        for (const sectionItem of getVisibleSections(entry, gates)) {
          items.push({
            id: `settings:${entry.id}:${sectionItem.id}`,
            section,
            label: `${label} › ${t(sectionItem.labelKey, sectionItem.defaultLabel)}`,
            icon: entry.icon,
            keywords: [sectionItem.id, t("commandPalette.settings")],
            perform: { kind: "run", run: () => openSettings(entry.id, { section: sectionItem.id }) },
          })
        }
      }
    }
    return items
  }

  return {
    id: "settings",
    pages: ["root", "settings"],
    prefix: ">",
    getItems: ({ page, query, permissions }) => (page === "root" && !query ? [] : rowsFor(permissions, page)),
    getStableItems: ({ permissions }) => rowsFor(permissions, "root"),
  }
}

/** Personal preferences: the dashboard language switches in place, each notification row opens the Notifications tab. */
export function createPreferencesProvider(deps: {
  t: TFunction
  /** The resolved dashboard language, e.g. "it". */
  language: string
  setLanguage: (language: DashboardLanguage) => void
  openSettings: ReturnType<typeof useSettingsDialog>["openSettings"]
}): PaletteProvider {
  const { t, language, setLanguage, openSettings } = deps
  const section = t("commandPalette.preferences.section")

  const rows = (): PaletteItem[] => {
    const languageRows = DASHBOARD_LANGUAGES.filter(({ value }) => value !== language).map(
      (entry): PaletteItem => ({
        id: `prefs:language:${entry.value}`,
        section,
        label: t("commandPalette.preferences.switchLanguage", { language: entry.label }),
        icon: Language,
        keywords: ["lingua", "language", entry.value, entry.label],
        perform: { kind: "run", run: () => setLanguage(entry.value) },
      }),
    )

    const notificationRows = NOTIFICATION_PREF_ITEMS.map(
      ({ key, text }): PaletteItem => ({
        id: `prefs:notify:${key}`,
        section,
        label: t("commandPalette.preferences.notify", { event: t(`settings.notifications.${text}.label`) }),
        icon: Bell,
        keywords: ["notifiche", "notifications", "avvisi", "alerts"],
        perform: { kind: "run", run: () => openSettings("notifications") },
      }),
    )

    return [...languageRows, ...notificationRows]
  }

  return {
    id: "prefs",
    pages: ["root"],
    prefix: ">",
    getItems: ({ query, prefix }) => (!query && prefix !== ">" ? [] : rows()),
    getStableItems: rows,
  }
}

/** The system status, for people who may read infrastructure stats (`view_analytics` on `*`); absent for everyone else. */
export function createSystemStatusProvider(deps: {
  t: TFunction
  health: { readonly data: SystemHealth | undefined; readonly isError: boolean }
}): PaletteProvider {
  const { t, health } = deps

  const rows = ({ permissions }: { permissions: PalettePermissions }): PaletteItem[] => {
    if (!permissions.canGlobally("view_analytics")) return []

    const base = {
      id: "system:status",
      section: t("commandPalette.system.section"),
      label: t("commandPalette.system.status"),
      icon: Pulse,
      keywords: ["status", "stato", "health", "salute", "worker", "quota", "storage", "database", "d1", "r2"],
    }

    if (!health.data) {
      return [
        {
          ...base,
          unavailableReason: health.isError ? t("commandPalette.system.statusUnavailable") : t("common.loading"),
          perform: { kind: "copy", value: "" },
        },
      ]
    }

    const { status, storage, database } = health.data
    const summary = t(
      status === "healthy" ? "commandPalette.system.statusHealthy" : "commandPalette.system.statusWarning",
      { storage: storage.percentage, database: database.percentage },
    )
    return [{ ...base, description: summary, perform: { kind: "copy", value: summary } }]
  }

  return {
    id: "system",
    pages: ["root"],
    prefix: ">",
    getItems: (context) => (!context.query && context.prefix !== ">" ? [] : rows(context)),
    getStableItems: rows,
  }
}

/** Content type builder shortcuts, whole surface hidden unless the caller holds `manage_seeds` globally. */
export function createContentTypesProvider(deps: {
  t: TFunction
  seeds: readonly Seed[]
  openBuilder: (intent: string) => void
}): PaletteProvider {
  const { t, seeds, openBuilder } = deps

  const editableSeeds = seeds.filter((seed) => !isSystemSeedSlug(seed.slug))

  const newTypeRow = (): PaletteItem => ({
    id: "schema:new",
    section: t("commandPalette.schema"),
    label: t("commandPalette.newContentType"),
    icon: Plus,
    shortcut: [ALT_KEY_LABEL, SHIFT_KEY_LABEL, "N"],
    keywords: ["seed", "schema", "nuovo tipo", "new type", "content type", "crea"],
    perform: { kind: "run", run: () => openBuilder(SEED_INTENT_NEW) },
  })

  const editPageRow = (): PaletteItem => ({
    id: "schema:edit",
    section: t("commandPalette.schema"),
    label: t("commandPalette.editContentType"),
    icon: Layers,
    perform: { kind: "page", page: "edit-schema" },
  })

  const editTypedRow = (seed: Seed): PaletteItem => ({
    id: `schema:edit:${seed.slug}`,
    section: t("commandPalette.schema"),
    label: t("commandPalette.editSchemaOf", { label: seed.label }),
    icon: resolveIcon(seed.dashboard?.icon),
    keywords: ["schema", "seed", "modifica", "edit", "campi", "fields", seed.slug],
    perform: { kind: "run", run: () => openBuilder(seed.slug) },
  })

  return {
    id: "schema",
    pages: ["root", "edit-schema"],
    getStableItems: ({ permissions }) =>
      permissions.canGlobally("manage_seeds") ? [newTypeRow(), editPageRow(), ...editableSeeds.map(editTypedRow)] : [],
    getItems: ({ page, query, permissions }) => {
      if (!permissions.canGlobally("manage_seeds")) return []

      if (page === "edit-schema") {
        return editableSeeds.map((seed): PaletteItem => ({
          id: `schema:edit:${seed.slug}`,
          section: t("commandPalette.chooseContentType"),
          label: seed.label,
          description: seed.slug,
          icon: resolveIcon(seed.dashboard?.icon),
          keywords: [seed.slug],
          perform: { kind: "run", run: () => openBuilder(seed.slug) },
        }))
      }

      return query ? [newTypeRow(), ...editableSeeds.map(editTypedRow)] : [newTypeRow(), editPageRow()]
    },
  }
}
