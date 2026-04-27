import type { AggregateFormula, TimeWindow, ListParams } from './types'

export const WIDGET_QUERY_KEYS = {
  all: ['widget'] as const,
  aggregate: (seed: string, formula: AggregateFormula, window: TimeWindow) =>
    ['widget', seed, 'aggregate', formula, window] as const,
  growth: (seed: string, formula: AggregateFormula, window: TimeWindow) =>
    ['widget', seed, 'growth', formula, window] as const,
  leaderboard: (seed: string, scoreColumn: string, limit: number) =>
    ['widget', seed, 'leaderboard', scoreColumn, limit] as const,
  list: (seed: string, params: ListParams) =>
    ['widget', seed, 'list', params] as const,
  timeseries: (seed: string, valueColumn: string, groupColumn: string, window: TimeWindow) =>
    ['widget', seed, 'timeseries', valueColumn, groupColumn, window] as const,
} as const
