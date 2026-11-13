// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"
import type { TFunction } from "i18next"
import { Copy } from "@/components/icons"
import { isStatus } from "@/components/ui/status"
import { resolveIcon } from "@/lib/icon-registry"
import { rpc } from "@/lib/rpc"
import type { PaletteAsyncProvider, PaletteItem } from "../types"

const SEARCH_RESULT_LIMIT = 8

/**
 * Full-text content hits as palette rows, in server order.
 * Visibility per seed is projected by the API; without `content:read` anywhere no request is sent.
 */
export function createContentSearchProvider(deps: {
  t: TFunction
  seeds: readonly Seed[]
  /** Unix seconds → display text ("3 hours ago"). Injected so the provider stays clock-free. */
  formatUpdatedAt: (unixSeconds: number) => string
}): PaletteAsyncProvider {
  const { t, seeds, formatUpdatedAt } = deps

  return {
    id: "search",
    pages: ["root"],
    prefix: "/",
    // Mirrors SEARCH_LIMITS.QUERY_MIN_LENGTH in apps/api/src/features/search/constants.ts.
    minQueryLength: 2,
    fetchItems: async ({ query, permissions }, signal) => {
      if (!permissions.canAnywhere("content:read")) return []

      const response = await rpc.api.search.$get(
        { query: { q: query, limit: String(SEARCH_RESULT_LIMIT) } },
        { init: { signal } },
      )
      const { items: hits } = await response.json()

      return hits.map((hit): PaletteItem => {
        const seed = seeds.find((candidate) => candidate.slug === hit.schema_slug)
        const description = [hit.author_name, formatUpdatedAt(hit.updated_at)].filter(Boolean).join(" · ")
        return {
          id: `search:${hit.id}`,
          section: seed?.label ?? hit.schema_slug,
          label: hit.title.trim() || t("commandPalette.untitledEntry"),
          status: isStatus(hit.status) ? hit.status : undefined,
          description,
          icon: resolveIcon(seed?.dashboard?.icon),
          perform: { kind: "navigate", to: `/content/${hit.schema_slug}/${hit.id}` },
          actions: [{ id: "copy-id", label: t("commandPalette.copyId"), icon: Copy, perform: { kind: "copy", value: hit.id } }],
        }
      })
    },
  }
}
