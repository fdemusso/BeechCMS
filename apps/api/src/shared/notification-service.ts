import { Context } from 'hono'

export interface NotificationParams {
  title: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
}

/**
 * Crea una notifica persistente nel database D1.
 * Usata principalmente per segnalare azioni provenienti dalle Public API.
 */
export async function createNotification(
  c: Context<any>,
  params: NotificationParams
): Promise<void> {
  const db = c.env.DB as D1Database
  if (!db) return

  const { title, message, type = 'info' } = params
  const id = crypto.randomUUID()

  // Usiamo waitUntil per non bloccare la richiesta dell'utente esterno
  c.executionCtx.waitUntil((async () => {
    try {
      await db.prepare(
        `INSERT INTO notifications (id, title, message, type)
         VALUES (?, ?, ?, ?)`
      ).bind(id, title, message, type).run()
    } catch (err) {
      console.error('Failed to create notification:', err)
    }
  })())
}
