// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"

import { buildGalleryCardDisplayModel } from "../gallery-card-display"
import type { GalleryCardDisplayModel } from "../gallery-card-display"
import { groupByCategory, type GalleryCategoryGroup } from "../group-by-category"
import { resolveCardFields } from "../resolve-card-fields"

export interface UseContentGalleryResult {
  peekId: string | null
  setPeekId: React.Dispatch<React.SetStateAction<string | null>>
  peekEntry: ContentEntry | null
  cardModels: GalleryCardDisplayModel[]
  /** Gruppi per categoria; vuoto se il seed non ha un campo categoria (vista piatta). */
  categoryGroups: GalleryCategoryGroup[]
  /** Alias del campo categoria, `null` se il seed non ne ha uno. */
  categoryAlias: string | null
}

export function useContentGallery(seed: Seed, data: ContentEntry[]): UseContentGalleryResult {
  const [peekId, setPeekId] = React.useState<string | null>(null)

  const peekEntry = React.useMemo(
    () => data.find((entry) => entry.id === peekId) ?? null,
    [data, peekId]
  )

  React.useEffect(() => {
    if (!peekId) return
    if (data.some((entry) => entry.id === peekId)) return
    setPeekId(null)
  }, [data, peekId])

  const cardFields = React.useMemo(() => resolveCardFields(seed), [seed])

  const cardModels = React.useMemo(
    () => data.map((entry) => buildGalleryCardDisplayModel(entry, cardFields)),
    [data, cardFields]
  )

  const categoryAlias = cardFields.categoryBranch?.alias ?? null

  const categoryGroups = React.useMemo(
    () => (categoryAlias ? groupByCategory(cardModels) : []),
    [cardModels, categoryAlias]
  )

  return {
    peekId,
    setPeekId,
    peekEntry,
    cardModels,
    categoryGroups,
    categoryAlias,
  }
}
