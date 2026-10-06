// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType, Dispatch, SetStateAction, SyntheticEvent } from 'react'
import type { ColumnFiltersState, RowSelectionState, SortingState, VisibilityState } from '@tanstack/react-table'
import type { DashboardView, FolderStyle, KanbanCardConfig, KanbanViewConfig, Seed } from '@beechcms/core'
import type { ContentEntry, DateGroupPrecision } from '@/lib/dynamic-columns'
import type { TableDensity } from '@/lib/density'
import type { ConditionalFormatRule, ElementFormatter } from '@/lib/conditional-format'

export type ToolbarTool =
  | 'filter'
  | 'sort'
  | 'automation'
  | 'search'
  | 'settings'
  | 'create'
  | 'transfer'

/** Universal settings-menu blocks a View Type opts into (name, filter, sort and delete are always there). */
export type ViewSetting = 'groupBy' | 'conditionalFormats' | 'cardLayout' | 'columns' | 'pageSize' | 'density'

/** Live list query shared by every View Type. Field names match useContentListQuery's return value. */
export interface ViewQueryState {
  readonly data: ContentEntry[]
  readonly isLoading: boolean
  readonly totalRows: number
  readonly pageIndex: number
  readonly setPageIndex: (index: number) => void
  readonly pageSize: number
  readonly handlePageSizeChange: (size: number) => void
  readonly pageCount: number
  readonly tableSearch: string
  readonly setTableSearch: (value: string) => void
  readonly debouncedSearch: string
  readonly sorting: SortingState
  readonly handleTableSortingChange: (next: SortingState) => void
  readonly columnFilters: ColumnFiltersState
  readonly isEmptySeed: boolean
  readonly applyCellFilter: (columnId: string, entry: ContentEntry) => void
}

/** Per-instance appearance and type sub-config, alias-keyed, persisted by the autosave. */
export interface ViewLayout {
  readonly groupBy: string | null
  readonly setGroupBy: Dispatch<SetStateAction<string | null>>
  readonly dateGroupPrecision: DateGroupPrecision
  readonly setDateGroupPrecision: Dispatch<SetStateAction<DateGroupPrecision>>
  readonly columnVisibility: VisibilityState
  readonly setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>
  readonly density: TableDensity
  readonly setDensity: Dispatch<SetStateAction<TableDensity>>
  readonly conditionalFormats: ConditionalFormatRule[]
  readonly setConditionalFormats: Dispatch<SetStateAction<ConditionalFormatRule[]>>
  readonly kanban: KanbanViewConfig
  readonly setKanban: Dispatch<SetStateAction<KanbanViewConfig>>
  readonly card: KanbanCardConfig | undefined
  readonly setCard: Dispatch<SetStateAction<KanbanCardConfig | undefined>>
  readonly folders: Record<string, FolderStyle> | undefined
  readonly setFolders: Dispatch<SetStateAction<Record<string, FolderStyle> | undefined>>
}

/** Emitted after a successful entry-editor save (same shape as EntryEditorDialog's onSaved). */
export interface ViewEntrySavedInfo {
  entryId?: string
  data: Record<string, unknown>
  isCreate: boolean
}

/** Entry actions shared by every View Type. Field names match useContentListModals' return value. */
export interface ViewEntryActions {
  readonly handleEdit: (entryId: string) => void
  readonly handleCreate: (defaultValues?: Record<string, unknown> | SyntheticEvent | Event) => void
  readonly handleDelete: (entryId: string) => void
  readonly handleBulkDelete: (entryIds: string[]) => void
  readonly handleBulkEdit: (entryIds: string[]) => void
  readonly rowSelection: RowSelectionState
  readonly setRowSelection: Dispatch<SetStateAction<RowSelectionState>>
  readonly selectedIds: string[]
  /** Adds a listener for entry-editor saves; returns its unsubscribe. */
  readonly subscribeSaved: (listener: (info: ViewEntrySavedInfo) => void) => () => void
}

/**
 * The one props contract every View Type renderer receives. A renderer controls only its own content area: it
 * renders inside the toolbar's view viewport and never sets outer margins, width or page chrome.
 */
export interface ViewRendererProps {
  readonly seed: Seed
  readonly slug: string
  readonly query: ViewQueryState
  readonly layout: ViewLayout
  /** Evaluates the instance's conditional formats for one Element. Renderers map the result to their own visuals. */
  readonly formatElement: ElementFormatter
  readonly entries: ViewEntryActions
  /** True while the instance's config autosave is in flight. */
  readonly isSaving: boolean
  /** The View Type's own configuration dialog, hosted by its renderer and opened from its settings section. */
  readonly configDialog: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }
}

/** Props of a View Type's own settings-menu block. */
export interface ViewSettingsSectionProps {
  readonly seed: Seed
  readonly layout: ViewLayout
  /** Closes the settings menu. */
  readonly onClose: () => void
  readonly onOpenConfigDialog: () => void
}

export interface ViewDefinition {
  type: DashboardView
  labelKey: string
  enabledTools: ToolbarTool[]
  settings: readonly ViewSetting[]
  Renderer: ComponentType<ViewRendererProps>
  /** Rendered in the settings menu, after quick actions. Omit when the universal blocks suffice. */
  SettingsSection?: ComponentType<ViewSettingsSectionProps>
}

export interface IViewRegistry {
  register(def: ViewDefinition): void
  get(type: DashboardView): ViewDefinition | undefined
  list(): ViewDefinition[]
}

/**
 * Brief §1/§4: View Types announced in the "Add view" picker but not implemented. Dashboard-only
 * identifiers with no runtime behaviour; the API keeps rejecting them (DashboardView is unchanged).
 */
export const RESERVED_VIEW_TYPES = [
  'chart', 'board', 'list', 'calendar', 'map', 'timeline', 'feed', 'form', 'dashboard',
] as const
export type ReservedViewType = (typeof RESERVED_VIEW_TYPES)[number]
/** Every View Type the picker knows about: implemented (DashboardView) or reserved. */
export type ViewTypeId = DashboardView | ReservedViewType
