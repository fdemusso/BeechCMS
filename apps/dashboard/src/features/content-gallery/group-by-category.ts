// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { GalleryCardDisplayModel } from "./gallery-card-display"

export interface GalleryCategoryGroup {
  /** Chiave stabile per React: categoria normalizzata, `null` per "senza categoria". */
  key: string | null
  /** Etichetta da mostrare; `null` per il gruppo "senza categoria". */
  label: string | null
  models: GalleryCardDisplayModel[]
}

/** Chiave di confronto di una categoria: ignora maiuscole e spazi ai bordi. */
export function categoryKey(label: string): string {
  return label.trim().toLocaleLowerCase("it")
}

/**
 * Raggruppa le card per categoria. Il confronto ignora maiuscole e spazi ai bordi
 * ("Matrimonio" e "matrimonio " finiscono nello stesso gruppo); l'etichetta è la
 * prima forma incontrata. I gruppi sono in ordine alfabetico, "senza categoria" in coda.
 * Mantiene l'ordine originale delle card dentro ogni gruppo.
 */
export function groupByCategory(models: GalleryCardDisplayModel[]): GalleryCategoryGroup[] {
  const groups = new Map<string, GalleryCategoryGroup>()
  const uncategorized: GalleryCardDisplayModel[] = []

  for (const model of models) {
    const label = model.category.trim()
    if (!label) {
      uncategorized.push(model)
      continue
    }
    const key = categoryKey(label)
    const group = groups.get(key)
    if (group) {
      group.models.push(model)
    } else {
      groups.set(key, { key, label, models: [model] })
    }
  }

  const sorted = [...groups.values()].sort((a, b) =>
    (a.label ?? "").localeCompare(b.label ?? "", "it", { sensitivity: "base" })
  )
  if (uncategorized.length > 0) {
    sorted.push({ key: null, label: null, models: uncategorized })
  }
  return sorted
}
