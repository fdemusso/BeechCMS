import * as React from 'react'
import { resolveKanbanColumns } from '@beechcms/core'
import type { Branch, KanbanColumnDescriptor } from '@beechcms/core'
import { KANBAN_MAX_COLUMNS } from '../constants'
import type { KanbanBoardConfig } from '../types'

export function useKanbanColumns(
  axisBranch: Branch | undefined,
  config: KanbanBoardConfig,
): KanbanColumnDescriptor[] {
  return React.useMemo(() => {
    if (!axisBranch) return []
    const all = resolveKanbanColumns(axisBranch)
    const hidden = new Set(config.hiddenColumnValues ?? [])
    const visible = all.filter(col => col.value === null || !hidden.has(col.value))
    return visible.slice(0, KANBAN_MAX_COLUMNS)
  }, [axisBranch, config.hiddenColumnValues])
}
