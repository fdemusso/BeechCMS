export { ContentKanban } from './content-kanban'
import type { IViewRegistry } from '@/features/content-toolbar/view-registry'
export function registerContentKanbanView(registry: IViewRegistry): void {
  registry.register({ type: 'kanban', labelKey: 'content.list.kanban',
    enabledTools: ['filter', 'search', 'settings', 'create'] })
}

export type { KanbanCardDisplayModel, KanbanColumnModel, KanbanColumnFetchState, KanbanBoardConfig, ContentKanbanProps, SavedEntryInfo } from './types'
export { useKanbanEntrySync } from './hooks/use-kanban-entry-sync'
export * from './constants'
export { buildKanbanCardDisplayModel } from './kanban-card-display'
export { useKanbanBoard } from './drag/use-kanban-board'
export type { DragSnapshot } from './drag/use-kanban-board'
export { useKanbanDrag } from './drag/use-kanban-drag'
export { positionBetween, rebalanceKeys } from './drag/fractional'
