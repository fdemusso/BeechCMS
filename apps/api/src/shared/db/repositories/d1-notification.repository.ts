// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type {
  INotificationRepository,
  NotificationRecord,
  NotificationStats,
  NotificationType,
  IClock,
  IIdGenerator,
} from '@beechcms/core'

interface NotificationRow {
  id: string
  title: string
  message: string
  type: string
  is_read: number
  created_at: number
}

interface NotificationStatsRow {
  total_count: number | null
  latest_created_at: number | null
  read_count: number | null
}

/**
 * D1-backed implementation of {@link INotificationRepository}.
 */
export class D1NotificationRepository implements INotificationRepository {
  constructor(
    private readonly database: D1Database,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async list(limit: number): Promise<NotificationRecord[]> {
    const queryResult = await this.database
      .prepare(
        `SELECT id, title, message, type, is_read, created_at
           FROM notifications
           ORDER BY created_at DESC
           LIMIT ?`
      )
      .bind(limit)
      .all<NotificationRow>()

    return (queryResult.results ?? []).map(mapRowToRecord)
  }

  async stats(): Promise<NotificationStats> {
    const statsRow = await this.database
      .prepare(
        `SELECT COUNT(*) as total_count,
                MAX(created_at) as latest_created_at,
                SUM(is_read) as read_count
           FROM notifications`
      )
      .first<NotificationStatsRow>()

    return {
      totalCount: statsRow?.total_count ?? 0,
      latestCreatedAt: statsRow?.latest_created_at ?? 0,
      readCount: statsRow?.read_count ?? 0,
    }
  }

  async create(record: Omit<NotificationRecord, 'id' | 'createdAt' | 'isRead'>): Promise<string> {
    const generatedId = this.idGenerator.uuid()
    const safeType = Object.hasOwn(record, 'type') && record.type ? record.type : 'info'
    const safeTitle = Object.hasOwn(record, 'title') && typeof record.title === 'string' ? record.title : ''
    const safeMessage = Object.hasOwn(record, 'message') && typeof record.message === 'string' ? record.message : ''
    await this.database
      .prepare(
        `INSERT INTO notifications (id, title, message, type)
         VALUES (?, ?, ?, ?)`
      )
      .bind(generatedId, safeTitle, safeMessage, safeType)
      .run()
    return generatedId
  }

  async markRead(notificationId: string): Promise<void> {
    await this.database
      .prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')
      .bind(notificationId)
      .run()
  }

  async markUnread(notificationId: string): Promise<void> {
    await this.database
      .prepare('UPDATE notifications SET is_read = 0 WHERE id = ?')
      .bind(notificationId)
      .run()
  }

  async markAllRead(): Promise<void> {
    await this.database.prepare('UPDATE notifications SET is_read = 1').run()
  }

  async delete(notificationId: string): Promise<void> {
    await this.database
      .prepare('DELETE FROM notifications WHERE id = ?')
      .bind(notificationId)
      .run()
  }
}

function mapRowToRecord(row: NotificationRow): NotificationRecord {
  const safeType = Object.hasOwn(row, 'type') && row.type ? row.type : 'info'
  return {
    id: Object.hasOwn(row, 'id') ? row.id : '',
    title: Object.hasOwn(row, 'title') ? row.title : '',
    message: Object.hasOwn(row, 'message') ? row.message : '',
    type: safeType as NotificationType,
    isRead: Object.hasOwn(row, 'is_read') ? row.is_read === 1 : false,
    createdAt: Object.hasOwn(row, 'created_at') ? row.created_at : 0,
  }
}
