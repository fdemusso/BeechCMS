// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"

import { toPlainText } from "./gallery-card-display"
import { categoryKey } from "./group-by-category"

/** Parametro URL con la cartella aperta: il tasto "indietro" del browser torna alle cartelle. */
export const FOLDER_PARAM = "album"
/** Valore del parametro per la cartella "Altre foto" (foto senza categoria). */
export const UNCATEGORIZED_PARAM = "__altre"

/**
 * Valori precompilati per "Nuovo" quando una cartella è aperta: il campo "Raggruppa per"
 * assume il valore della cartella. `undefined` se nessuna cartella (o quella
 * "senza categoria") è aperta o il campo non esiste nel seed.
 */
export function folderCreateDefaults(
  seed: Seed,
  data: ContentEntry[],
  groupBy: string | null,
  folderParam: string | null
): Record<string, unknown> | undefined {
  if (!groupBy || !folderParam || folderParam === UNCATEGORIZED_PARAM) return undefined
  if (!seed.branches.some((branch) => branch.alias === groupBy)) return undefined

  for (const entry of data) {
    const label = toPlainText(entry.data[groupBy]).trim()
    if (label && categoryKey(label) === folderParam) return { [groupBy]: label }
  }
  return undefined
}
