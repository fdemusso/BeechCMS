/// <reference types="@cloudflare/workers-types" />
import type {
  INotificationRepository,
  NotificationRecord,
  NotificationStats,
  NotificationType,
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
  constructor(private readonly database: D1Database) {}

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
    const generatedId = crypto.randomUUID()
    await this.database
      .prepare(
        `INSERT INTO notifications (id, title, message, type)
         VALUES (?, ?, ?, ?)`
      )
      .bind(generatedId, record.title, record.message, record.type)
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
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type as NotificationType,
    isRead: row.is_read === 1,
    createdAt: row.created_at,
  }
}
