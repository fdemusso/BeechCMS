// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  IActivityLogRepository,
  ActivityLogRecord,
  ActivityLogListOptions,
  ActivityLogVisibility,
  ActivityAction,
  EntityType,
  CountSinceOptions,
} from '@beechcms/core'

interface ActivityLogRow {
  id: string
  user_id: string
  user_email: string
  user_name: string | null
  action: string
  entity_type: string
  entity_id: string
  entity_slug: string | null
  details: string | null
  created_at: number
}

/**
 * D1-backed implementation of {@link IActivityLogRepository}.
 *
 * Builds parameterised queries with optional WHERE clauses without nesting
 * conditionals — guard clauses keep the body flat and the SQL deterministic.
 */
export class D1ActivityLogRepository implements IActivityLogRepository {
  constructor(private readonly database: D1Database) {}

  async list(options: ActivityLogListOptions): Promise<ActivityLogRecord[]> {
    const whereClauses: string[] = []
    const bindings: unknown[] = []

    if (options.userId) {
      whereClauses.push('user_id = ?')
      bindings.push(options.userId)
    }

    if (options.entitySlug) {
      whereClauses.push('entity_slug = ?')
      bindings.push(options.entitySlug)
    }

    const visibilityFilter = buildVisibilityFilter(options.visibility)
    if (visibilityFilter) {
      whereClauses.push(visibilityFilter.clause)
      bindings.push(...visibilityFilter.bindings)
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const sql =
      `SELECT id, user_id, user_email, user_name, action, entity_type,
              entity_id, entity_slug, details, created_at
         FROM activity_logs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ?`

    bindings.push(options.limit)

    const queryResult = await this.database.prepare(sql).bind(...bindings).all<ActivityLogRow>()
    return (queryResult.results ?? []).map(mapRowToRecord)
  }

  async countSince(options: CountSinceOptions): Promise<number> {
    const whereClauses = ['action = ?', 'entity_type = ?', 'created_at >= ?']
    const bindings: unknown[] = [options.action, options.entityType, options.sinceTimestamp]

    const visibilityFilter = buildVisibilityFilter(options.visibility)
    if (visibilityFilter) {
      whereClauses.push(visibilityFilter.clause)
      bindings.push(...visibilityFilter.bindings)
    }

    const row = await this.database
      .prepare(
        `SELECT COUNT(*) as count
           FROM activity_logs
          WHERE ${whereClauses.join(' AND ')}`
      )
      .bind(...bindings)
      .first<{ count: number }>()
    return row?.count ?? 0
  }
}

/**
 * Translate a visibility rule into one SQL clause plus its bindings, or `null` when unrestricted.
 *
 * A slug list is bound as a single JSON array through `json_each(?)`, so the
 * query never approaches D1's bound-parameter cap and never emits `IN ()`.
 */
function buildVisibilityFilter(
  visibility: ActivityLogVisibility | undefined,
): { clause: string; bindings: unknown[] } | null {
  if (!visibility) return null

  const { seeds, includeUnscoped } = visibility

  if (seeds === 'all') {
    return includeUnscoped ? null : { clause: 'entity_slug IS NOT NULL', bindings: [] }
  }

  if (seeds.length === 0) {
    return { clause: includeUnscoped ? 'entity_slug IS NULL' : '1 = 0', bindings: [] }
  }

  const slugMatch = 'entity_slug IN (SELECT value FROM json_each(?))'
  return {
    clause: includeUnscoped ? `(${slugMatch} OR entity_slug IS NULL)` : slugMatch,
    bindings: [JSON.stringify(seeds)],
  }
}

function mapRowToRecord(row: ActivityLogRow): ActivityLogRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    action: row.action as ActivityAction,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    entitySlug: row.entity_slug,
    details: parseDetails(row.details),
    createdAt: row.created_at,
  }
}

function parseDetails(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
