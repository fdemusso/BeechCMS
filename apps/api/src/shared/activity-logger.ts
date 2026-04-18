import { Context } from 'hono'

export type ActivityAction = 'create' | 'update' | 'delete' | 'upload'
export type EntityType = 'content' | 'media'

export interface ActivityLogParams {
  action: ActivityAction
  entityType: EntityType
  entityId: string
  entitySlug?: string
  details?: Record<string, any>
}

/**
 * Logga un'azione utente asincronamente nel database D1.
 * Estrae le info dell'utente dal JWT payload presente nel contesto Hono.
 */
export function logActivity(
  c: Context<any>,
  params: ActivityLogParams
): void {
  const db = c.env.DB as D1Database
  const user = c.get('jwtPayload') as { sub: string; email: string } | undefined

  if (!db || !user) return

  const { action, entityType, entityId, entitySlug, details } = params
  const id = crypto.randomUUID()

  // Usa waitUntil per non bloccare la risposta al client
  c.executionCtx.waitUntil((async () => {
    try {
      await db.prepare(
        `INSERT INTO activity_logs (id, user_id, user_email, action, entity_type, entity_id, entity_slug, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        user.sub,
        user.email || 'unknown',
        action,
        entityType,
        entityId,
        entitySlug || null,
        details ? JSON.stringify(details) : null
      ).run()
    } catch (err) {
      console.error('Failed to log activity:', err)
    }
  })())
}
