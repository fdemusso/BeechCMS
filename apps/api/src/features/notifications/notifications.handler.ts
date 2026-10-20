// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
 * Weak ETag over the exact payload the client would render. Aggregates such as
 * count / newest timestamp / read total are not a function of the list content,
 * so distinct inbox states could share a tag and be served a stale 304.
 */
async function buildListEtag(limit: number, payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${limit}:${payload}`))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `W/"${hex.slice(0, 32)}"`
}

/**
 * GET /notifications
 *
 * Returns the most recent notifications. The ETag is derived from the list
 * itself (capped at {@link NOTIFICATION_LIST_LIMIT}), so an unchanged inbox
 * returns 304 without re-sending the body and any visible change busts it.
 */
notificationsApp.get('/notifications', async (context) => {
  try {
    const notifications = await context.get('notificationRepository').list(NOTIFICATION_LIST_LIMIT)
    const body = JSON.stringify(notifications)
    const etagValue = await buildListEtag(NOTIFICATION_LIST_LIMIT, body)

    if (context.req.header('If-None-Match') === etagValue) {
      return new Response(null, { status: 304, headers: { ETag: etagValue } })
    }

    context.header('ETag', etagValue)
    context.header('Cache-Control', 'no-cache, must-revalidate')

    return context.body(body, 200, { 'Content-Type': 'application/json' })
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
