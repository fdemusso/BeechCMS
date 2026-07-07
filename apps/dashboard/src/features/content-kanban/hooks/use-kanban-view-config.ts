import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSeedViewConfig, updateSeedViewConfig } from '@/lib/content-api'
import type { KanbanConfig, KanbanCardConfig, SeedViewConfig } from '@beechcms/core'
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

  const cardConfig: KanbanCardConfig | undefined = data?.card

  const mutation = useMutation({
    mutationFn: (next: SeedViewConfig) => updateSeedViewConfig(seedSlug, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const setKanbanConfig = React.useCallback(
    (next: KanbanConfig) => mutation.mutate({ ...data, kanban: next }),
    [mutation, data],
  )

  const setCardConfig = React.useCallback(
    (next: KanbanCardConfig) => mutation.mutate({ ...data, card: next }),
    [mutation, data],
  )

  return { kanbanConfig, cardConfig, isLoading, setKanbanConfig, setCardConfig, isSaving: mutation.isPending }
}
