// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"
import type { TFunction } from "i18next"
import { Layers, Plus } from "@/components/icons"
import { resolveIcon } from "@/lib/icon-registry"
import type { PaletteItem, PaletteProvider } from "../types"

const IDLE_SEED_LIMIT = 5

/**
 * Content navigation and creation rows, one per seed the caller can read.
 * A seed the caller cannot `content:read` is never listed; one without `content:create` is listed disabled on the create page.
 */
export function createContentProvider(deps: { t: TFunction; seeds: readonly Seed[] }): PaletteProvider {
  const { t, seeds } = deps

  return {
    id: "content",
    pages: ["root", "seeds", "create"],
    getItems: ({ page, query, permissions }) => {
      const readableSeeds = seeds
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

      if (page === "seeds") {
        return readableSeeds.map((seed) => openRow(seed, t("commandPalette.chooseSeed")))
      }

      if (page === "create") {
        return readableSeeds.map((seed) => ({
          id: `content:create:${seed.slug}`,
          section: t("commandPalette.chooseType"),
          label: seed.label,
          description: seed.slug,
          icon: resolveIcon(seed.dashboard?.icon),
          requires: { permission: "content:create", scope: seed.slug },
          perform: { kind: "navigate", to: `/content/${seed.slug}/create` },
        }))
      }

      const section = t("commandPalette.contents")
      const shownSeeds = query ? readableSeeds : readableSeeds.slice(0, IDLE_SEED_LIMIT)
      const items: PaletteItem[] = shownSeeds.map((seed) => ({
        id: `content:open:${seed.slug}`,
        section,
        label: t("commandPalette.goTo", { label: seed.label }),
        icon: resolveIcon(seed.dashboard?.icon),
        keywords: [seed.slug, "contenuto", "lista"],
        perform: { kind: "navigate", to: `/content/${seed.slug}` },
      }))

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
        items.push({
          id: "content:new",
          section: t("commandPalette.create"),
          label: t("commandPalette.newContent"),
          icon: Plus,
          shortcut: ["Alt", "N"],
          requires: { permission: "content:create" },
          perform: { kind: "page", page: "create" },
        })
      }
      return items
    },
  }
}
