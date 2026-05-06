/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'

/**
 * Notifications Feature Handler
 *
 * Manages the retrieval, marking as read/unread, and deletion of system notifications.
 * Uses ETags for efficient client-side caching of the notification list.
 */
const notificationsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * GET /notifications
 * Fetches the latest 50 notifications.
 * Implements ETag/304 Not Modified caching based on count and last update.
 */
notificationsApp.get('/notifications', async (context) => {
  try {
    const { DB } = context.env

    // Fetch aggregate stats to generate a robust ETag
    const stats = await DB.prepare(
      'SELECT COUNT(*) as count, MAX(created_at) as latest, SUM(is_read) as read_sum FROM notifications'
    ).first<{ count: number; latest: number | null; read_sum: number | null }>()

    const totalCount = stats?.count ?? 0
    const lastUpdateTimestamp = stats?.latest ?? 0
    const totalReadCount = stats?.read_sum ?? 0

    // ETag is derived from count, latest timestamp, and read status to ensure freshness
    const etag = `W/"${totalCount}-${lastUpdateTimestamp}-${totalReadCount}"`

    const ifNoneMatch = context.req.header('If-None-Match')
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304 })
    }

    const dbResult = await DB.prepare(
      'SELECT id, title, message, type, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 50'
    ).all()

    context.header('ETag', etag)
    context.header('Cache-Control', 'no-cache, must-revalidate')

    return context.json(dbResult.results ?? [])
  } catch (error) {
    console.error('[Notifications] Fetch error:', error)
    return context.json({ error: 'Failed to fetch notifications' }, 500)
  }
})

/**
 * PATCH /notifications/:id/read
 * Marks a specific notification as read.
 */
notificationsApp.patch('/notifications/:id/read', async (context) => {
  try {
    const notificationId = context.req.param('id')
    const { DB } = context.env

    await DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')
      .bind(notificationId)
      .run()

    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark read error:', error)
    return context.json({ error: 'Failed to update notification' }, 500)
  }
})

/**
 * PATCH /notifications/:id/unread
 * Marks a specific notification as unread.
 */
notificationsApp.patch('/notifications/:id/unread', async (context) => {
  try {
    const notificationId = context.req.param('id')
    const { DB } = context.env

    await DB.prepare('UPDATE notifications SET is_read = 0 WHERE id = ?')
      .bind(notificationId)
      .run()

    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark unread error:', error)
    return context.json({ error: 'Failed to update notification' }, 500)
  }
})

/**
 * DELETE /notifications/:id
 * Permanently deletes a notification.
 */
notificationsApp.delete('/notifications/:id', async (context) => {
  try {
    const notificationId = context.req.param('id')
    const { DB } = context.env

    await DB.prepare('DELETE FROM notifications WHERE id = ?')
      .bind(notificationId)
      .run()

    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Delete error:', error)
    return context.json({ error: 'Failed to delete notification' }, 500)
  }
})

/**
 * POST /notifications/mark-all-read
 * Marks all notifications in the database as read.
 */
notificationsApp.post('/notifications/mark-all-read', async (context) => {
  try {
    const { DB } = context.env

    await DB.prepare('UPDATE notifications SET is_read = 1').run()

    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark all read error:', error)
    return context.json({ error: 'Failed to update notifications' }, 500)
  }
})

export { notificationsApp }
