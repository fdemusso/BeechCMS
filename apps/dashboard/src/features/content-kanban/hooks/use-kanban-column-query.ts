import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { kanbanColumnFilter } from '@beechcms/core'
import type { Branch, KanbanColumnDescriptor, FilterGroup, Seed, KanbanCardConfig } from '@beechcms/core'
import { fetchKanbanColumn } from '@/lib/content-api'
import { buildKanbanCardDisplayModel } from '../kanban-card-display'
import type { KanbanBoardConfig, KanbanColumnFetchState } from '../types'
import { KANBAN_COLUMN_PAGE_SIZE } from '../constants'

export function useKanbanColumnQuery(
  seedSlug: string,
  axisBranch: Branch,
  col: KanbanColumnDescriptor,
  config: KanbanBoardConfig,
  activeFilters: FilterGroup[],
  search: string,
  seed?: Seed,
  cardConfig?: KanbanCardConfig,
): KanbanColumnFetchState {
  const colFilter = kanbanColumnFilter(axisBranch, col.value)
  const allFilters: FilterGroup[] = [colFilter, ...activeFilters]

  const sortBy = config.sort?.branchId
  const sortDir = config.sort?.dir?.toLowerCase() as 'asc' | 'desc' | undefined

  const { data, hasNextPage, isFetching, isLoading, fetchNextPage } = useInfiniteQuery({
    queryKey: ['kanban', seedSlug, config.axisBranchId, col.value, allFilters, search, config.sort],
    queryFn: ({ pageParam = 0 }) =>
      fetchKanbanColumn(seedSlug, {
        filters: allFilters,
        kanbanAxis: config.axisBranchId!,
        limit: KANBAN_COLUMN_PAGE_SIZE,
        offset: pageParam as number,
        search: search || undefined,
        sortBy,
        sortDir,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const fetched = pages.reduce((n, p) => n + p.items.length, 0)
      return fetched < lastPage.total ? fetched : undefined
    },
    enabled: Boolean(config.axisBranchId),
  })

  const total = data?.pages[0]?.total ?? 0
  const cards = (data?.pages ?? []).flatMap(page =>
    page.items.map(item => buildKanbanCardDisplayModel(item, axisBranch, col.value, seed, cardConfig)),
  )

  return { cards, total, hasNextPage: Boolean(hasNextPage), isFetching, isLoading, fetchNextPage }
}

export function useInvalidateKanbanColumn(
  seedSlug: string,
  axisBranchId: string | null,
  colValue: string | null,
) {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: ['kanban', seedSlug, axisBranchId, colValue],
    })
}
