// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { FolderStyle, KanbanCardConfig, Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"
import type { ElementFormatter } from "@/lib/conditional-format"

export interface ContentGalleryProps {
  readonly seed: Seed
  readonly data: ContentEntry[]
  readonly isLoading?: boolean
  readonly onEdit: (entryId: string) => void
  /** Apre il modulo di creazione con valori precompilati (es. la categoria). */
  readonly onCreate?: (defaultValues: Record<string, unknown>) => void
  /** Campo scelto nel "Raggruppa per" del toolbar; stesso stato usato dalla tabella. */
  readonly groupBy: string | null
  readonly formatElement?: ElementFormatter
  /** Layout card personalizzato (config condivisa col Kanban); assente → solo euristica di default. */
  readonly card?: KanbanCardConfig
  /** Stile per cartella, chiave = `group.key` (o UNCATEGORIZED_PARAM). */
  readonly folders?: Record<string, FolderStyle>
  /** Se presente le cartelle mostrano la matita di modifica. */
  readonly onFoldersChange?: (next: Record<string, FolderStyle> | undefined) => void
}
