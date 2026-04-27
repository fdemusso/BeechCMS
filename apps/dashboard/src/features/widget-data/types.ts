export type AggregateFormula =
  | { op: 'count' }
  | { op: 'sum'; column: string }
  | { op: 'avg'; column: string }
  | { op: 'min'; column: string }
  | { op: 'max'; column: string }
  | { op: 'countWhere'; column: string; value: unknown }
  | { op: 'percentageOf'; numeratorColumn: string; denominatorColumn: string }

export type TimeWindow = 'week' | 'month' | 'year' | 'all'
export type SortDirection = 'asc' | 'desc'

export type ResolvedEntry = Record<string, unknown> & {
  id: string
  slug: string
  status: string
  createdAt: number
  updatedAt: number
}

export interface GrowthResult {
  current: number
  previous: number
  percentageChange: number
  trend: 'up' | 'down' | 'flat'
}

export interface LeaderboardEntry {
  id: string
  label: string
  score: number | string
}

export interface ProgressResult {
  value: number
  min: number
  max: number
  percentage: number
}

export interface AggregateResult {
  value: number
  window: TimeWindow
}

export interface TimeseriesPoint {
  label: string
  value: number
}

export interface TimeseriesResult {
  points: TimeseriesPoint[]
}

export interface ListParams {
  columns?: string[]
  search?: string
  filters?: Array<{ column: string; op: string; value: unknown }>
  orderBy?: string
  orderDir?: SortDirection
  limit?: number
  offset?: number
}

export interface ListResult {
  entries: ResolvedEntry[]
  total: number
}
