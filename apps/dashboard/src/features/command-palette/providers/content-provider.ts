// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"
import type { TFunction } from "i18next"
import { Layers, Plus } from "@/components/icons"
import { resolveIcon } from "@/lib/icon-registry"
import type { PaletteItem, PaletteProvider, PalettePermissions } from "../types"

const IDLE_SEED_LIMIT = 5

/**
 * Content navigation and creation rows, one per seed the caller can read.
 * A seed the caller cannot `content:read` is never listed; one without `content:create` is listed disabled on the create page.
 */
export function createContentProvider(deps: { t: TFunction; seeds: readonly Seed[] }): PaletteProvider {
  const { t, seeds } = deps

  const readableSeedsFor = (permissions: PalettePermissions): Seed[] =>
    seeds
      .filter((seed) => !seed.dashboard?.hidden && permissions.can("content:read", seed.slug))
      .sort((a, b) => (a.dashboard?.order ?? 99) - (b.dashboard?.order ?? 99))

  const openRow = (seed: Seed, section: string): PaletteItem => ({
    id: `content:open:${seed.slug}`,
    section,
    label: seed.label,
    description: seed.slug,
    icon: resolveIcon(seed.dashboard?.icon),
    perform: { kind: "navigate", to: `/content/${seed.slug}` },
  })

  const gotoRow = (seed: Seed): PaletteItem => ({
    id: `content:open:${seed.slug}`,
    section: t("commandPalette.contents"),
    label: t("commandPalette.goTo", { label: seed.label }),
    icon: resolveIcon(seed.dashboard?.icon),
    keywords: [seed.slug, "contenuto", "lista"],
    perform: { kind: "navigate", to: `/content/${seed.slug}` },
  })

  const createRow = (seed: Seed, label: string, section: string): PaletteItem => ({
    id: `content:create:${seed.slug}`,
    section,
    label,
    description: seed.slug,
    icon: resolveIcon(seed.dashboard?.icon),
    requires: { permission: "content:create", scope: seed.slug },
    perform: { kind: "navigate", to: `/content/${seed.slug}/create` },
  })

  const newContentRow = (): PaletteItem => ({
    id: "content:new",
    section: t("commandPalette.create"),
    label: t("commandPalette.newContent"),
    icon: Plus,
    shortcut: ["Alt", "N"],
    requires: { permission: "content:create" },
    perform: { kind: "page", page: "create" },
  })

  return {
    id: "content",
    pages: ["root", "seeds", "create"],
    getStableItems: ({ permissions }) => {
      const readableSeeds = readableSeedsFor(permissions)
      return [
        ...readableSeeds.map(gotoRow),
        ...readableSeeds.map((seed) =>
          createRow(seed, t("commandPalette.createIn", { label: seed.label }), t("commandPalette.create")),
        ),
        ...(readableSeeds.length > 0 ? [newContentRow()] : []),
      ]
    },
    getItems: ({ page, query, permissions }) => {
      const readableSeeds = readableSeedsFor(permissions)

      if (page === "seeds") {
        return readableSeeds.map((seed) => openRow(seed, t("commandPalette.chooseSeed")))
      }

      if (page === "create") {
        return readableSeeds.map((seed) => createRow(seed, seed.label, t("commandPalette.chooseType")))
      }

      const section = t("commandPalette.contents")
      const shownSeeds = query ? readableSeeds : readableSeeds.slice(0, IDLE_SEED_LIMIT)
      const items: PaletteItem[] = shownSeeds.map(gotoRow)

      if (!query && readableSeeds.length > IDLE_SEED_LIMIT) {
        items.push({
          id: "content:all",
          section,
          label: t("commandPalette.allSeeds"),
          icon: Layers,
          perform: { kind: "page", page: "seeds" },
        })
      }

      if (readableSeeds.length > 0) {
        items.push(newContentRow())
      }
      return items
    },
  }
}
