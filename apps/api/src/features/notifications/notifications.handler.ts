/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'

/**
 * Notifications Feature Handler.
 *
 * Manages retrieval, mark read/unread, and deletion of system notifications.
 * All persistence goes through the {@link INotificationRepository} injected
 * by `repositoryMiddleware`. The handler owns the HTTP concerns only:
 * ETag negotiation, status codes, error mapping.
 */
const notificationsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

const NOTIFICATION_LIST_LIMIT = 50

/**
 * GET /notifications
 *
 * Returns the most recent notifications. The ETag is built from aggregate
 * stats so unchanged inboxes return 304 without serialising the full list.
 */
notificationsApp.get('/notifications', async (context) => {
  try {
    const notificationRepository = context.get('notificationRepository')
    const notificationStats = await notificationRepository.stats()
    const etagValue = `W/"${notificationStats.totalCount}-${notificationStats.latestCreatedAt}-${notificationStats.readCount}"`

    const ifNoneMatch = context.req.header('If-None-Match')
    if (ifNoneMatch === etagValue) {
      return new Response(null, { status: 304 })
    }

    const notifications = await notificationRepository.list(NOTIFICATION_LIST_LIMIT)

    context.header('ETag', etagValue)
    context.header('Cache-Control', 'no-cache, must-revalidate')

    return context.json(notifications)
  } catch (error) {
    console.error('[Notifications] Fetch error:', error)
    return context.json({ error: 'Failed to fetch notifications' }, 500)
  }
})

/**
 * PATCH /notifications/:id/read — mark a single notification as read.
 */
notificationsApp.patch('/notifications/:id/read', async (context) => {
  try {
    const notificationId = context.req.param('id')
    await context.get('notificationRepository').markRead(notificationId)
    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark read error:', error)
    return context.json({ error: 'Failed to update notification' }, 500)
  }
})

/**
 * PATCH /notifications/:id/unread — mark a single notification as unread.
 */
notificationsApp.patch('/notifications/:id/unread', async (context) => {
  try {
    const notificationId = context.req.param('id')
    await context.get('notificationRepository').markUnread(notificationId)
    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark unread error:', error)
    return context.json({ error: 'Failed to update notification' }, 500)
  }
})

/**
 * DELETE /notifications/:id — permanently remove a notification.
 */
notificationsApp.delete('/notifications/:id', async (context) => {
  try {
    const notificationId = context.req.param('id')
    await context.get('notificationRepository').delete(notificationId)
    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Delete error:', error)
    return context.json({ error: 'Failed to delete notification' }, 500)
  }
})

/**
 * POST /notifications/mark-all-read — mark every notification as read.
 */
notificationsApp.post('/notifications/mark-all-read', async (context) => {
  try {
    await context.get('notificationRepository').markAllRead()
    return context.json({ success: true })
  } catch (error) {
    console.error('[Notifications] Mark all read error:', error)
    return context.json({ error: 'Failed to update notifications' }, 500)
  }
})

export { notificationsApp }
