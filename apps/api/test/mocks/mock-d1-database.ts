/**
 * REUSABLE MOCK D1 DATABASE
 * Simula il comportamento del database D1 di Cloudflare Workers.
 */
export class MockD1Database {
  users: any[] = []
  refreshTokens: Array<{ id: string, token_hash: string, user_id: string, expires_at: number, revoked_at: number | null }> = []
  mediaObjects: Array<{ key: string, filename: string, mime_type: string, size_bytes: number, uploaded_by: string }> = []
  systemStats: Record<string, number> = { 'total_storage_bytes': 0 }
  activityLogs: any[] = []

  constructor(initialData: { users?: any[] } = {}) {
    this.users = initialData.users || []
  }

  prepare(sql: string) {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim()
    
    // Support for bind() or direct execution
    const executor = (...args: any[]) => ({
      /** Simula il recupero di un singolo record */
      first: async <T>() => {
        if (normalizedSql.includes('FROM users WHERE email = ?')) {
          return this.users.find(u => u.email === args[0]) as T || null
        }
        if (normalizedSql.includes('FROM users WHERE id = ?')) {
          return this.users.find(u => u.id === args[0]) as T || null
        }
        if (normalizedSql.includes('FROM refresh_tokens WHERE token_hash = ?')) {
          const nowTimestamp = typeof args[1] === 'number' ? args[1] : 0
          return this.refreshTokens.find(t =>
            t.token_hash === args[0] &&
            t.revoked_at === null &&
            t.expires_at > nowTimestamp
          ) as T || null
        }
        if (normalizedSql.includes('SELECT name FROM users WHERE id = ?')) {
          return this.users.find(u => u.id === args[0]) as T || null
        }
        if (normalizedSql.includes("SELECT COUNT(*) as n FROM users WHERE role = 'admin'")) {
          return { n: this.users.filter(u => u.role === 'admin').length } as T
        }
        if (normalizedSql.includes('SELECT COUNT(*) as n FROM content_')) {
          // Simulate some content if it's a content table
          return { n: 1 } as T
        }
        if (normalizedSql.includes('FROM media_objects WHERE key = ?')) {
          return this.mediaObjects.find(m => m.key === args[0]) as T || null
        }
        return null
      },
      /** Simula il recupero di una lista di record */
      all: async <T>() => {
        if (normalizedSql.includes("SELECT name FROM sqlite_master WHERE type='table'")) {
          return {
            results: [
              { name: 'users' },
              { name: 'refresh_tokens' },
              { name: 'media_objects' },
              { name: 'analytics' },
              { name: 'system_stats' },
              { name: 'activity_logs' },
              { name: 'content_posts' }, // Assume at least one content table exists
            ] as T[]
          }
        }
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
        if (normalizedSql.includes('INSERT INTO activity_logs')) {
           const [id, user_id, user_email, user_name, action, entity_type, entity_id, entity_slug, details] = args
           this.activityLogs.push({ id, user_id, user_email, user_name, action, entity_type, entity_id, entity_slug, details })
           return { success: true, meta: { changes: 1 } }
        }
        return { success: true, meta: {} }
      }
    })

    return {
      bind: (...args: any[]) => executor(...args),
      ...executor()
    }
  }
}
