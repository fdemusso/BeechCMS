/**
 * REUSABLE MOCK D1 DATABASE
 * Simula il comportamento del database D1 di Cloudflare Workers.
 */
export class MockD1Database {
  users: any[] = []
  refreshTokens: Array<{ id: string, token_hash: string, user_id: string, expires_at: number, revoked_at: number | null }> = []
  mediaObjects: Array<{ key: string, filename: string, mime_type: string, size_bytes: number, uploaded_by: string }> = []
  systemStats: Record<string, number> = { 'total_storage_bytes': 0 }

  constructor(initialData: { users?: any[] } = {}) {
    this.users = initialData.users || []
  }

  prepare(sql: string) {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim()
    return {
      bind: (...args: any[]) => ({
        /** Simula il recupero di un singolo record */
        first: async <T>() => {
          if (normalizedSql.includes('FROM users WHERE email = ?')) {
            return this.users.find(u => u.email === args[0]) as T || null
          }
          if (normalizedSql.includes('FROM users WHERE id = ?')) {
            return this.users.find(u => u.id === args[0]) as T || null
          }
          if (normalizedSql.includes('FROM refresh_tokens WHERE token_hash = ?')) {
            return this.refreshTokens.find(t => t.token_hash === args[0]) as T || null
          }
          if (normalizedSql.includes('SELECT name FROM users WHERE id = ?')) {
            return this.users.find(u => u.id === args[0]) as T || null
          }
          return null
        },
        /** Simula il recupero di una lista di record */
        all: async <T>() => {
          return { results: [] as T[] }
        },
        /** Simula l'esecuzione di una modifica (INSERT/UPDATE) */
        run: async () => {
          if (normalizedSql.includes('INSERT INTO refresh_tokens')) {
            const [id, userId, tokenHash, expiresAt] = args
            this.refreshTokens.push({ id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null })
            return { success: true, meta: { changes: 1 } }
          }
          if (normalizedSql.includes('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?')) {
            const [revokedAt, tokenHash] = args
            const mustBeNull = normalizedSql.includes('AND revoked_at IS NULL')
            const t = this.refreshTokens.find(t => t.token_hash === tokenHash && (!mustBeNull || t.revoked_at === null))
            if (t) {
              t.revoked_at = revokedAt
              return { success: true, meta: { changes: 1 } }
            }
            return { success: true, meta: { changes: 0 } }
          }
          if (normalizedSql.includes('UPDATE system_stats SET value = CAST(value AS INTEGER) + ? WHERE id = \'total_storage_bytes\'')) {
            this.systemStats['total_storage_bytes'] += args[0]
            return { success: true, meta: { changes: 1 } }
          }
          if (normalizedSql.includes('UPDATE system_stats SET value = MAX(0, CAST(value AS INTEGER) - ?) WHERE id = \'total_storage_bytes\'')) {
            this.systemStats['total_storage_bytes'] = Math.max(0, this.systemStats['total_storage_bytes'] - args[0])
            return { success: true, meta: { changes: 1 } }
          }
          if (normalizedSql.includes('INSERT INTO media_objects')) {
            const [key, filename, mime_type, size_bytes, uploaded_by] = args
            this.mediaObjects.push({ key, filename, mime_type, size_bytes, uploaded_by })
            return { success: true, meta: { changes: 1 } }
          }
          if (normalizedSql.includes('DELETE FROM media_objects WHERE key = ?')) {
            this.mediaObjects = this.mediaObjects.filter(m => m.key !== args[0])
            return { success: true, meta: { changes: 1 } }
          }
          if (normalizedSql.includes('INSERT INTO activity_log')) {
             return { success: true, meta: { changes: 1 } }
          }
          return { success: true, meta: {} }
        }
      })
    }
  }
}
