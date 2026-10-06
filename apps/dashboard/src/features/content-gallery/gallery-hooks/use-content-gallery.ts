// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { KanbanCardConfig, Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"
import { NO_ELEMENT_FORMATTER, type ElementFormatter } from "@/lib/conditional-format"

import { buildGalleryCardDisplayModel } from "../gallery-card-display"
import type { GalleryCardDisplayModel } from "../gallery-card-display"
import { groupByCategory, type GalleryCategoryGroup } from "../group-by-category"
import { resolveCardFields } from "../resolve-card-fields"

export interface UseContentGalleryResult {
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
  groupBy: string | null,
  formatElement: ElementFormatter = NO_ELEMENT_FORMATTER,
  card?: KanbanCardConfig
): UseContentGalleryResult {
  const { t, i18n } = useTranslation()

  const cardFields = React.useMemo(() => resolveCardFields(seed, groupBy, card), [seed, groupBy, card])

  const cardModels = React.useMemo(
    () => data.map((entry) => buildGalleryCardDisplayModel(entry, cardFields, t, i18n.language, formatElement(entry), !!seed.allowDrafts)),
    [data, cardFields, t, i18n.language, formatElement, seed.allowDrafts]
  )

  const categoryAlias = cardFields.categoryBranch?.alias ?? null

  const categoryGroups = React.useMemo(
    () => (categoryAlias ? groupByCategory(cardModels) : []),
    [cardModels, categoryAlias]
  )

  return {
    cardModels,
    categoryGroups,
    categoryAlias,
  }
}
