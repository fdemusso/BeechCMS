// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type * as React from "react"
import type {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  GroupingState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table"
import type { TableDensity } from "@/lib/density"

export const DEFAULT_PAGE_SIZE = 10
export const CELL_CLICK_DELAY_MS = 200
/** Altezza riga condivisa da tutte le tabelle dell'app — riusala per coerenza dimensionale. */
export const ROW_HEIGHT_PX = 48
/** Altezza container in modalità virtual scroll (gruppi espansi) */
export const VIRTUAL_CONTAINER_HEIGHT = "calc(100vh - 280px)"

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  initialHiddenColumns?: string[]
  /**
   * Calcolo styling per riga eseguito una volta sola e poi riusato per tutte le celle.
   * Se presente, ha priorità su `getRowClassName` / `getCellClassName`.
   */
  getRowStyles?: (row: TData) => {
    rowClassName?: string
    cellClassNameByColumnId?: Record<string, string | undefined>
  }
  /** Classi extra per la riga (esclude group header rows). */
  getRowClassName?: (row: TData) => string | undefined
  /** Classi extra per una cella specifica (esclude group header rows). */
  getCellClassName?: (row: TData, columnId: string) => string | undefined
  /**
   * Se fornito, abilita il menu contestuale (tasto destro) sulle celle della riga.
   * La funzione deve rendere SOLO gli items del menu (content interno).
   */
  renderRowContextMenuContent?: (row: TData) => React.ReactNode
  /** Colonne escluse dal menu contestuale (default: select, actions). */
  rowContextMenuExcludedColumnIds?: string[]
  /** Selezione righe controllata dall'esterno (chiavi: rowId). */
  rowSelection?: RowSelectionState
  /** Callback quando cambia la selezione righe (in modalità controllata). */
  onRowSelectionChange?: (next: RowSelectionState) => void
  /** Filtro globale (ricerca) controllato dall'esterno. Se non fornito, usa stato interno. */
  globalFilter?: string
  onGlobalFilterChange?: (value: string) => void
  /** Stato di ordinamento controllato dall'esterno (opzionale). */
  sorting?: SortingState
  /** Callback quando cambia l'ordinamento (usata in modalità controllata). */
  onSortingChange?: (sorting: SortingState) => void
  /** Filtri per-colonna controllati dall'esterno (opzionale). */
  columnFilters?: ColumnFiltersState
  /** Callback quando cambiano i filtri per-colonna (usata in modalità controllata). */
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void
  /** Visibilità colonne controllata dall'esterno (opzionale). */
  columnVisibility?: VisibilityState
  /** Callback quando cambia la visibilità delle colonne (in modalità controllata). */
  onColumnVisibilityChange?: (visibility: VisibilityState) => void
  /** Numero di righe per pagina controllato dall'esterno (opzionale). */
  pageSize?: number
  /** Callback quando cambia il numero di righe per pagina (in modalità controllata). */
  onPageSizeChange?: (size: number) => void
  /** Indice pagina controllato dall'esterno (0-based). */
  pageIndex?: number
  /** Callback quando cambia la pagina corrente (0-based). */
  onPageIndexChange?: (index: number) => void
  /** Numero totale pagine (richiesto in manualPagination). */
  pageCount?: number
  /** Numero totale righe server-side (per testo "x di y selezionate"). */
  totalRows?: number
  /** Modalità paginazione server-side. */
  manualPagination?: boolean
  /** Modalità ordinamento server-side. */
  manualSorting?: boolean
  /** Modalità filtro server-side. */
  manualFiltering?: boolean
  /** Contenuto custom quando la tabella non ha righe (sostituisce "Nessun risultato."). */
  emptyState?: React.ReactNode
  /**
   * Stato di raggruppamento controllato dall'esterno.
   * Quando non vuoto, la tabella passa in modalità virtual scroll
   * e la paginazione viene disabilitata.
   */
  grouping?: GroupingState
  /** Callback quando cambia il raggruppamento. */
  onGroupingChange?: (grouping: GroupingState) => void
  /** Callback opzionale al doppio click su una riga. */
  onRowDoubleClick?: (row: TData) => void
  /** Abilita il ridimensionamento colonne (default: false). */
  enableColumnResizing?: boolean
  /** Larghezze colonne controllate dall'esterno (opzionale). */
  columnSizing?: ColumnSizingState
  /** Callback al cambio larghezze colonne (modalità controllata). */
  onColumnSizingChange?: (sizing: ColumnSizingState) => void
  /** Densità righe (default: "normal"). */
  density?: TableDensity
  /** Single-click activation of a cell value (e.g. click-to-filter). Feature-agnostic. */
  onCellActivate?: (columnId: string, row: TData) => void
  /** Column ids that must NOT trigger onCellActivate (interactive columns). */
  cellActivateExcludedColumnIds?: string[]
}
