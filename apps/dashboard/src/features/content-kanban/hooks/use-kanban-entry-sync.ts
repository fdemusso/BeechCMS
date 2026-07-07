import { useQueryClient } from '@tanstack/react-query'
import { resolveKanbanColumns } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import { useKanbanViewConfig } from './use-kanban-view-config'
import type { SavedEntryInfo } from '../types'

function toColumnValue(raw: unknown, validValues: Set<string>): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  const s = String(raw)
  return validValues.has(s) ? s : null
}

export function useKanbanEntrySync(seed: Seed | undefined, seedSlug: string) {
  const queryClient = useQueryClient()
  const { kanbanConfig } = useKanbanViewConfig(seedSlug)

  return (info: SavedEntryInfo) => {
    if (!seed) return
    const axisBranchId = kanbanConfig.axisBranchId
    if (!axisBranchId) return
    const axisBranch = seed.branches.find(b => b.id === axisBranchId)
    if (!axisBranch) return

    const descriptors = resolveKanbanColumns(axisBranch)
    const validValues = new Set(descriptors.map(d => d.value).filter((v): v is string => v !== null))

    const invalidateColumn = (colValue: string | null) =>
      queryClient.invalidateQueries({ queryKey: ['kanban', seedSlug, axisBranchId, colValue] })

    const raw = info.data[axisBranch.alias]
    const destValues = Array.isArray(raw)
      ? (raw.length ? raw.map(v => toColumnValue(v, validValues)) : [null])
      : [toColumnValue(raw, validValues)]
    const dest = new Set<string | null>(destValues)

    if (!info.isCreate && info.entryId) {
      const cached = queryClient.getQueriesData<{ pages?: Array<{ items: Array<{ id: string }> }> }>({
        queryKey: ['kanban', seedSlug, axisBranchId],
      })
      for (const [key, data] of cached) {
        const colValue = (key as unknown[])[3] as string | null
        const has = data?.pages?.some(p => p.items.some(it => it.id === info.entryId))
        if (has) dest.add(colValue)
      }
    }

    dest.forEach(invalidateColumn)
  }
}
