import type { Seed, KanbanConfig } from '@beechcms/core'

/** Pure render model for a card — computed once at fetch (KB-S18). */
export interface KanbanCardDisplayModel {
  entryId: string
  title: string
  statusBadge?: string
  imageUrl?: string
  axisValue: string | null
  position: string | null
  /** True while a drag API call is in-flight (KB-U13b/S14f). */
  isPending?: boolean
  /** True when this is the ghost at the drag source (KB-U10). */
  isGhost?: boolean
}

export interface KanbanColumnModel {
  value: string | null
  label: string
  total: number
  cards: KanbanCardDisplayModel[]
}

/** Per-column fetch state from useInfiniteQuery (KB-S05/S06). */
export interface KanbanColumnFetchState {
  cards: KanbanCardDisplayModel[]
  total: number
  hasNextPage: boolean
  isFetching: boolean
  isLoading: boolean
  fetchNextPage: () => void
}

/** Runtime board config (axis resolved + user prefs). */
export interface KanbanBoardConfig extends KanbanConfig {
  collapsedColumnValues?: string[]
}

export interface ContentKanbanProps {
  seed: Seed
  seedSlug: string
  data?: unknown[]
  isLoading?: boolean
  onEdit: (id: string) => void
  onCreateEntry?: (defaultValues?: Record<string, unknown>) => void
  activeFilters?: import('@beechcms/core').FilterGroup[]
  search?: string
  kanbanConfig: KanbanBoardConfig
  setKanbanConfig: (next: import('@beechcms/core').KanbanConfig) => void
  isSaving?: boolean
}

/** Emitted by the entry editor after a successful LIVE save (create or edit). */
export interface SavedEntryInfo {
  /** Entry id; undefined on create when the API response omits it. */
  entryId?: string
  /** The submitted form data (carries the axis branch value under its alias). */
  data: Record<string, unknown>
  /** True when this was a create, false when an edit. */
  isCreate: boolean
}
