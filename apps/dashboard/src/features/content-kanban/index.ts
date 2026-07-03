export { ContentKanban } from './components/content-kanban'
export { CardConfigDialog } from './components/card-config-dialog'
export { useKanbanViewConfig } from './hooks/use-kanban-view-config'

import type { IViewRegistry } from '@/features/shared'
export function registerContentKanbanView(registry: IViewRegistry): void {
  registry.register({
    type: 'kanban',
    labelKey: 'content.list.kanban',
    enabledTools: ['filter', 'search', 'settings', 'create']
  })
}

export type {
  KanbanCardDisplayModel,
  KanbanColumnModel,
  KanbanColumnFetchState,
  KanbanBoardConfig,
  ContentKanbanProps,
  SavedEntryInfo
} from './types'

export { useKanbanEntrySync } from './hooks/use-kanban-entry-sync'
export * from './constants'
