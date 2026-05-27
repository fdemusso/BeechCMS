// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Activity Logger contract.
 *
 * Records side-effect events ("a user did X to entity Y") for the audit trail
 * displayed in the dashboard's settings activity tab and the recent activity
 * feed. The interface is intentionally framework-agnostic so it can be
 * fulfilled in production by a D1-backed implementation, in tests by an
 * in-memory implementation, and in the future by remote sinks.
 *
 * @module @beechcms/core/observability/activity-logger
 */

export type ActivityAction = 'create' | 'update' | 'delete' | 'upload' | 'bulk_update'
export type EntityType = 'content' | 'media'

/**
 * Identifies the human (or machine) actor that triggered the event.
 *
 * The actor MUST be assembled by the caller (typically a Hono handler that has
 * already authenticated the request). The logger never reaches into a
 * framework-specific context to discover who is acting — this avoids hidden
 * coupling and lets the same logger run inside CLI scripts and background
 * jobs.
 */
export interface ActivityActor {
  id: string
  email: string
  name?: string | null
}

export interface ActivityLogEntry {
  action: ActivityAction
  entityType: EntityType
  entityId: string
  entitySlug?: string
  details?: Record<string, unknown>
  actor: ActivityActor
}

export interface IActivityLogger {
  /**
   * Persist a single activity entry.
   *
   * Implementations decide whether to fire-and-forget (Cloudflare
   * `executionCtx.waitUntil`) or to wait inline (test environments).
   * In either case the call MUST NOT throw to the caller: logging is
   * observability, never a hard dependency of the request being served.
   * Internal errors must be swallowed and logged via `console.error` so the
   * mainline response path is never disturbed by audit-trail failures.
   */
  log(entry: ActivityLogEntry): Promise<void> | void
}
