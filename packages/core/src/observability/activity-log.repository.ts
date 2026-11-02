// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Activity Log read-side repository contract.
 *
 * Used by handlers that surface the audit trail back to the user (settings
 * activity tab, recent activity feed on the dashboard). Kept separate from
 * {@link IActivityLogger} because writers and readers have different
 * lifecycles: writes are fire-and-forget background tasks; reads are blocking
 * request paths that need filters and pagination.
 *
 * @module @beechcms/core/observability/activity-log.repository
 */
import type { ActivityAction, EntityType } from './activity-logger.js'

export interface ActivityLogRecord {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  action: ActivityAction
  entityType: EntityType
  entityId: string
  entitySlug: string | null
  details: Record<string, unknown> | null
  createdAt: number
}

/**
 * Which activity rows a caller may see, keyed on the seed each row is tied to.
 * Omitted from an options object = no restriction (the self-service per-user feed).
 */
export interface ActivityLogVisibility {
  /**
   * `'all'`: every row that carries a seed slug.
   * A list: only rows whose `entitySlug` is in it. An empty list matches no slugged row.
   */
  readonly seeds: 'all' | readonly string[]
  /** Whether rows with `entitySlug === null` (media uploads, schema events, security alerts) are visible. */
  readonly includeUnscoped: boolean
}

export interface ActivityLogListOptions {
  /** Restrict the result to a specific user. Used by the per-user activity tab. */
  userId?: string
  /** Restrict the result to a specific content seed. Used by per-seed feeds. */
  entitySlug?: string
  /** Authorization filter applied in the query, before `limit`. */
  visibility?: ActivityLogVisibility
  /** Hard upper bound on the number of rows returned. */
  limit: number
}

export interface CountSinceOptions {
  action: ActivityAction
  entityType: EntityType
  /** Lower bound (inclusive) for `createdAt` in seconds since epoch. */
  sinceTimestamp: number
  /** Authorization filter applied in the query. */
  visibility?: ActivityLogVisibility
}

export interface IActivityLogRepository {
  /**
   * Return the most recent activity entries matching the given filters.
   *
   * The list is always ordered by `createdAt` DESC so callers get newest-first
   * data without paying extra sort costs in TypeScript. Used by the settings
   * activity tab (per-user) and by the stats recent-activity feed (scope-projected).
   */
  list(options: ActivityLogListOptions): Promise<ActivityLogRecord[]>

  /**
   * Count entries with the given `action` and `entityType` whose `createdAt`
   * is greater-than-or-equal to `sinceTimestamp`.
   *
   * Used by the dashboard `/stats/total` widget to surface today/week/month
   * create-event counts without hardcoding SQL in the handler. Each period
   * is one call so the repository contract stays narrow and deterministic.
   */
  countSince(options: CountSinceOptions): Promise<number>
}
