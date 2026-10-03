// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
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
  /** Gruppi per categoria; vuoto se non c'è un "Raggruppa per" attivo (vista piatta). */
  categoryGroups: GalleryCategoryGroup[]
  /** Alias del campo scelto come "Raggruppa per", `null` se nessuno. */
  categoryAlias: string | null
}

/**
 * `groupBy` è lo stesso stato del "Raggruppa per" del toolbar della tabella
 * (`tableConfig.groupBy`): le cartelle della gallery non indovinano il campo
 * categoria dal nome, usano la scelta esplicita dell'utente.
 */
export function useContentGallery(
  seed: Seed,
  data: ContentEntry[],
  groupBy: string | null
): UseContentGalleryResult {
  const { t, i18n } = useTranslation()
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

  const cardFields = React.useMemo(() => resolveCardFields(seed, groupBy), [seed, groupBy])

  const cardModels = React.useMemo(
    () => data.map((entry) => buildGalleryCardDisplayModel(entry, cardFields, t, i18n.language)),
    [data, cardFields, t, i18n.language]
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
