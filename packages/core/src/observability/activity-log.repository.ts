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

export interface ActivityLogListOptions {
  /** Restrict the result to a specific user. Used by the per-user activity tab. */
  userId?: string
  /** Restrict the result to a specific content seed. Used by per-seed feeds. */
  entitySlug?: string
  /** Hard upper bound on the number of rows returned. */
  limit: number
}

export interface CountSinceOptions {
  action: ActivityAction
  entityType: EntityType
  /** Lower bound (inclusive) for `createdAt` in seconds since epoch. */
  sinceTimestamp: number
}

export interface IActivityLogRepository {
  /**
   * Return the most recent activity entries matching the given filters.
   *
   * The list is always ordered by `createdAt` DESC so callers get newest-first
   * data without paying extra sort costs in TypeScript. Used by the settings
   * activity tab (per-user) and by the stats recent-activity feed (global).
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
