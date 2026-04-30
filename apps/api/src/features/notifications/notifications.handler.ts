/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'

const notificationsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /notifications — lista con ETag/304
notificationsApp.get('/notifications', async (c) => {
    try {
        const { DB } = c.env

        const stats = await DB.prepare(
            'SELECT COUNT(*) as count, MAX(created_at) as latest, SUM(is_read) as read_sum FROM notifications'
        ).first<{ count: number; latest: number | null; read_sum: number | null }>()

        const count = stats?.count ?? 0
        const latest = stats?.latest ?? 0
        const readSum = stats?.read_sum ?? 0
        const etag = `W/"${count}-${latest}-${readSum}"`

        const ifNoneMatch = c.req.header('If-None-Match')
        if (ifNoneMatch === etag) {
            return new Response(null, { status: 304 })
        }

        const result = await DB.prepare(
            'SELECT id, title, message, type, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 50'
        ).all()

        c.header('ETag', etag)
        c.header('Cache-Control', 'no-cache, must-revalidate')

        return c.json(result.results ?? [])
    } catch (err) {
        console.error('Notifications fetch error:', err)
        return c.json({ error: 'Failed to fetch notifications' }, 500)
    }
})


// PATCH /notifications/:id/read — segna come letta
notificationsApp.patch('/notifications/:id/read', async (c) => {
    try {
        const id = c.req.param('id')
        const { DB } = c.env
        await DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').bind(id).run()
        return c.json({ success: true })
    } catch (err) {
        return c.json({ error: 'Failed to update notification' }, 500)
    }
})
// PATCH /notifications/:id/unread - Segna come non letta
notificationsApp.patch('/notifications/:id/unread', async (c) => {
    try {
        const id = c.req.param('id')
        const { DB } = c.env
        await DB.prepare('UPDATE notifications SET is_read = 0 WHERE id = ?').bind(id).run()
        return c.json({ success: true })
    } catch (err) {
        return c.json({ error: 'Failed to update notification' }, 500)
    }
})


// DELETE /notifications/:id — elimina notifica
notificationsApp.delete('/notifications/:id', async (c) => {
    try {
        const id = c.req.param('id')
        const { DB } = c.env
        await DB.prepare('DELETE FROM notifications WHERE id = ?').bind(id).run()
        return c.json({ success: true })
    } catch (err) {
        return c.json({ error: 'Failed to delete notification' }, 500)
    }
})


// POST /notifications/mark-all-read — segna tutte come lette
notificationsApp.post('/notifications/mark-all-read', async (c) => {
    try {
        const { DB } = c.env
        await DB.prepare('UPDATE notifications SET is_read = 1').run()
        return c.json({ success: true })
    } catch (err) {
        return c.json({ error: 'Failed to update notifications' }, 500)
    }
})
export { notificationsApp }
