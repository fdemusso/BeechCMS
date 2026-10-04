import { useInfiniteQuery } from '@tanstack/react-query'
import { kanbanColumnFilter } from '@beechcms/core'
import type { Branch, KanbanColumnDescriptor, FilterGroup, Seed, KanbanCardConfig } from '@beechcms/core'
import { fetchKanbanColumn } from '@/lib/content-api'
import { useLocalizeEntryData } from '@/features/shared'
import { NO_ELEMENT_FORMATTER, type ElementFormatter } from '@/lib/conditional-format'
import { buildKanbanCardDisplayModel } from '../utils/kanban-card-display'
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
  formatElement: ElementFormatter = NO_ELEMENT_FORMATTER,
): KanbanColumnFetchState {
  const localize = useLocalizeEntryData()
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
    page.items.map(item => {
      const localizedEntry = { ...item, data: localize(seed, item.data) }
      return buildKanbanCardDisplayModel(
        localizedEntry,
        axisBranch,
        col.value,
        seed,
        cardConfig,
        formatElement(localizedEntry),
      )
    }),
  )

  return { cards, total, hasNextPage: Boolean(hasNextPage), isFetching, isLoading, fetchNextPage }
}
