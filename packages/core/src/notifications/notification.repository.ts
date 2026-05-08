/**
 * Notification repository contract.
 *
 * Persists in-app notifications (admin inbox) and exposes the aggregate stats
 * the GET /notifications handler needs to build a strong ETag without reading
 * every row.
 *
 * @module @beechcms/core/notifications/notification.repository
 */

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface NotificationRecord {
  id: string
  title: string
  message: string
  type: NotificationType
  isRead: boolean
  createdAt: number
}

export interface NotificationStats {
  totalCount: number
  latestCreatedAt: number
  readCount: number
}

export interface INotificationRepository {
  /**
   * Return the most recent notifications, newest first.
   *
   * The `limit` parameter is required to prevent unbounded reads — the inbox
   * could grow large over time and clients only ever render a window.
   */
  list(limit: number): Promise<NotificationRecord[]>

  /**
   * Return aggregate counters used to build the GET /notifications ETag.
   *
   * Computing `totalCount`, `latestCreatedAt` and `readCount` on the database
   * side lets the handler skip serialising the full list when nothing has
   * changed since the client's last poll, saving bandwidth on the dashboard.
   */
  stats(): Promise<NotificationStats>

  /**
   * Insert a new notification and return its generated id so callers (e.g.
   * the public form submission flow) can correlate the notification with the
   * triggering request.
   */
  create(record: Omit<NotificationRecord, 'id' | 'createdAt' | 'isRead'>): Promise<string>

  markRead(notificationId: string): Promise<void>
  markUnread(notificationId: string): Promise<void>
  markAllRead(): Promise<void>
  delete(notificationId: string): Promise<void>
}
