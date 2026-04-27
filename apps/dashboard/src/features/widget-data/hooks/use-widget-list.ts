import { useQuery } from '@tanstack/react-query'
import type { ListParams, ListResult } from '../types'
import { listFetch } from '../widget.api'
import { WIDGET_QUERY_KEYS } from '../query-keys'

export function useWidgetList(
  seed: string,
  params: ListParams,
): {
  data: ListResult | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
} {
  return useQuery({
    queryKey: WIDGET_QUERY_KEYS.list(seed, params),
    queryFn: () => listFetch(seed, params),
    staleTime: 0,
  })
}
