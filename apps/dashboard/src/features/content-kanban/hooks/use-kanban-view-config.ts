import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSeedViewConfig, updateSeedViewConfig } from '@/lib/content-api'
import type { KanbanConfig, SeedViewConfig } from '@beechcms/core'
import type { KanbanBoardConfig } from '../types'

export function useKanbanViewConfig(seedSlug: string) {
  const queryClient = useQueryClient()
  const queryKey = ['seed-view-config', seedSlug]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchSeedViewConfig(seedSlug),
    staleTime: 60_000,
  })

  const kanbanConfig: KanbanBoardConfig = React.useMemo(() => ({
    axisBranchId: data?.kanban?.axisBranchId ?? null,
    sort: data?.kanban?.sort ?? null,
    hiddenColumnValues: data?.kanban?.hiddenColumnValues,
    collapsedColumnValues: data?.kanban?.collapsedColumnValues,
  }), [data])

  const mutation = useMutation({
    mutationFn: (next: KanbanConfig) => {
      const merged: SeedViewConfig = { ...data, kanban: next }
      return updateSeedViewConfig(seedSlug, merged)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const setKanbanConfig = React.useCallback(
    (next: KanbanConfig) => mutation.mutate(next),
    [mutation],
  )

  return { kanbanConfig, isLoading, setKanbanConfig, isSaving: mutation.isPending }
}
