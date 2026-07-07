// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IActivityLogger, ActivityLogEntry, IClock, IIdGenerator } from '@beechcms/core'

const ACTIVITY_LOG_INSERT_SQL =
  `INSERT INTO activity_logs
     (id, user_id, user_email, user_name, action, entity_type, entity_id, entity_slug, details)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

const FALLBACK_USER_EMAIL = 'unknown'

type ScheduleBackgroundTask = (task: Promise<unknown>) => void

/**
 * D1-backed implementation of {@link IActivityLogger}.
 *
 * When `scheduleBackgroundTask` is provided (production path, wired to
 * `c.executionCtx.waitUntil`), the INSERT runs after the response is sent so
 * audit logging never adds latency to the user-facing request. When absent
 * (tests, scripts), the INSERT runs inline and any errors are logged.
 */
export class D1ActivityLogger implements IActivityLogger {
  constructor(
    private readonly database: D1Database,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly scheduleBackgroundTask?: ScheduleBackgroundTask
  ) {}

  log(entry: ActivityLogEntry): Promise<void> | void {
    const insertPromise = this.runInsert(entry)

    if (this.scheduleBackgroundTask) {
      this.scheduleBackgroundTask(insertPromise)
      return
    }

    return insertPromise
  }

  private async runInsert(entry: ActivityLogEntry): Promise<void> {
    try {
      const recordId = this.idGenerator.uuid()
      const serializedDetails = entry.details ? JSON.stringify(entry.details) : null

      await this.database
        .prepare(ACTIVITY_LOG_INSERT_SQL)
        .bind(
          recordId,
          entry.actor.id,
          entry.actor.email || FALLBACK_USER_EMAIL,
          entry.actor.name ?? null,
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.entitySlug ?? null,
          serializedDetails
        )
        .run()
    } catch (error) {
      console.error('D1ActivityLogger: failed to persist activity entry', error)
    }
  }
}
