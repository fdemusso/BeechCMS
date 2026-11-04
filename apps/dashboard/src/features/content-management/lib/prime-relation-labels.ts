// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { QueryClient } from "@tanstack/react-query"
import { resolveRelationAvatar, type Seed } from "@beechcms/core"
import type { ContentEntry } from "@/lib/dynamic-columns"
import type { ContentListWithMeta } from "../api/content.api"
import { CONTENT_QUERY_KEYS } from "../consts/content.keys"

/**
 * Primes the detail cache with the relation labels (and avatar URLs) a list response carries, so the relation chips of
 * its rows resolve from the cache instead of fetching each target entry (the N+1 on the list view).
 *
 * Existing detail entries are never overwritten. The stub's `updated_at: null` is the marker read by
 * `isRelationLabelStub` (use-content-item.ts).
 */
export function primeRelationLabels(
  queryClient: QueryClient,
  seeds: ReadonlyArray<Seed>,
  slug: string,
  response: Pick<ContentListWithMeta, "relations" | "relationAvatars">,
): void {
  if (!response.relations) return
  const currentSeed = seeds.find((seed) => seed.slug === slug)
  if (!currentSeed) return

  for (const [alias, idLabelMap] of Object.entries(response.relations)) {
    const branch = currentSeed.branches.find((candidate) => candidate.alias === alias)
    if (!branch || branch.type !== "relation") continue
    const targetSlug = (branch as { targetSeed?: string }).targetSeed
    if (!targetSlug) continue

    const targetSeed = seeds.find((seed) => seed.slug === targetSlug)
    const labelAlias = targetSeed?.displayNameAlias ?? "title"
    // The avatar URL rides in the same stub, so a relation avatar costs no per-row fetchById either.
    const avatarAlias = resolveRelationAvatar(branch, (candidate) => seeds.find((seed) => seed.slug === candidate))?.alias
    const avatars = avatarAlias ? response.relationAvatars?.[alias] : undefined

    for (const [id, label] of Object.entries(idLabelMap)) {
      const cacheKey = CONTENT_QUERY_KEYS.detail(targetSlug, id)
      if (queryClient.getQueryData<ContentEntry>(cacheKey)) continue
      const avatar = avatarAlias ? avatars?.[id] : undefined
      queryClient.setQueryData<ContentEntry>(cacheKey, {
        id,
        slug: null,
        status: "published",
        data: avatarAlias && avatar ? { [labelAlias]: label, [avatarAlias]: avatar } : { [labelAlias]: label },
        created_at: null,
        updated_at: null,
      })
    }
  }
}
