import { useQuery } from '@tanstack/react-query'
import type { LeaderboardEntry } from '../types'
import { leaderboardFetch } from '../widget.api'
import { WIDGET_QUERY_KEYS } from '../query-keys'

export function useWidgetLeaderboard(
  seed: string,
  scoreColumn: string,
  options?: { limit?: number; orderBy?: 'asc' | 'desc'; labelAlias?: string },
): {
  data: LeaderboardEntry[] | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
} {
  const limit = options?.limit ?? 10

  return useQuery({
    queryKey: WIDGET_QUERY_KEYS.leaderboard(seed, scoreColumn, limit),
    queryFn: () => leaderboardFetch(seed, scoreColumn, options),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  })
}
