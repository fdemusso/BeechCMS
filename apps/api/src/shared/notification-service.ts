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
  let executionCtx: { waitUntil: (p: Promise<any>) => void } | undefined
  try {
    executionCtx = c.executionCtx
  } catch {
    // In ambiente di test Hono lancia se non presente
  }

  if (executionCtx) {
    executionCtx.waitUntil((async () => {
      try {
        await db.prepare(
          `INSERT INTO notifications (id, title, message, type)
           VALUES (?, ?, ?, ?)`
        ).bind(id, title, message, type).run()
      } catch (err) {
        console.error('Failed to create notification:', err)
      }
    })())
  } else {
    // Fallback sync per test o ambienti senza executionCtx (se vogliamo che le notifiche siano create)
    // Oppure semplicemente ignoriamo. In questo caso, per i test, meglio tentare di crearle
    // ma dato che è un'azione opzionale "background", in test possiamo saltarla o farla sync.
    // Facciamola sync se non c'è executionCtx per garantire che i test che verificano le notifiche (se ce ne sono) passino.
    try {
      await db.prepare(
        `INSERT INTO notifications (id, title, message, type)
         VALUES (?, ?, ?, ?)`
      ).bind(id, title, message, type).run()
    } catch (err) {
      console.error('Failed to create notification (sync fallback):', err)
    }
  }
}
