// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// Composition root — palette providers that need the public API of other feature slices.

import { isSystemSeedSlug, type Seed } from "@beechcms/core"
import type { TFunction } from "i18next"
import { Layers, Plus } from "@/components/icons"
import type { PaletteItem, PaletteProvider } from "@/features/command-palette"
import { SEED_INTENT_NEW } from "@/features/seed-builder"
import {
  getVisibleSections,
  getVisibleSettingsEntries,
  SETTINGS_GROUP_LABELS,
  SETTINGS_GROUP_ORDER,
  useSettingsDialog,
} from "@/features/settings"
import { resolveIcon } from "@/lib/icon-registry"

/**
 * Settings tabs and the bookmarks inside them, shown only to callers the settings registry lets in.
 * Idle on the root page nothing is emitted: the navigation provider's "Settings…" row opens the settings page.
 */
export function createSettingsProvider(deps: {
  t: TFunction
  openSettings: ReturnType<typeof useSettingsDialog>["openSettings"]
}): PaletteProvider {
  const { t, openSettings } = deps

  return {
    id: "settings",
    pages: ["root", "settings"],
    getItems: ({ page, query, permissions }) => {
      if (page === "root" && !query) return []

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
    },
  }
}

/** Content type builder shortcuts, whole surface hidden unless the caller holds `manage_seeds` globally. */
export function createContentTypesProvider(deps: {
  t: TFunction
  seeds: readonly Seed[]
  openBuilder: (intent: string) => void
}): PaletteProvider {
  const { t, seeds, openBuilder } = deps

  return {
    id: "schema",
    pages: ["root", "edit-schema"],
    getItems: ({ page, query, permissions }) => {
      if (!permissions.canGlobally("manage_seeds")) return []

      const editableSeeds = seeds.filter((seed) => !isSystemSeedSlug(seed.slug))

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

      const section = t("commandPalette.schema")
      const items: PaletteItem[] = [
        {
          id: "schema:new",
          section,
          label: t("commandPalette.newContentType"),
          icon: Plus,
          keywords: ["seed", "schema", "nuovo tipo", "new type", "content type", "crea"],
          perform: { kind: "run", run: () => openBuilder(SEED_INTENT_NEW) },
        },
      ]

      if (!query) {
        items.push({
          id: "schema:edit",
          section,
          label: t("commandPalette.editContentType"),
          icon: Layers,
          perform: { kind: "page", page: "edit-schema" },
        })
        return items
      }

      for (const seed of editableSeeds) {
        items.push({
          id: `schema:edit:${seed.slug}`,
          section,
          label: t("commandPalette.editSchemaOf", { label: seed.label }),
          icon: resolveIcon(seed.dashboard?.icon),
          keywords: ["schema", "seed", "modifica", "edit", "campi", "fields", seed.slug],
          perform: { kind: "run", run: () => openBuilder(seed.slug) },
        })
      }
      return items
    },
  }
}
