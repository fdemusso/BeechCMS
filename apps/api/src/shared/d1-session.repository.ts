/// <reference types="@cloudflare/workers-types" />
import type { ISessionRepository, NewRefreshToken, RefreshTokenRecord, ActiveSessionSummary, IClock } from '@beechcms/core'

type RefreshTokenRow = {
  id: string
  user_id: string
  token_hash: string
  expires_at: number
  created_at: number
  revoked_at: number | null
}

type SessionSummaryRow = {
  id: string
  created_at: number
  expires_at: number
}

function rowToRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }
}

export class D1SessionRepository implements ISessionRepository {
  constructor(
    private readonly db: D1Database,
    private readonly clock: IClock,
  ) {}

  async saveRefreshToken(record: NewRefreshToken): Promise<void> {
    await this.db
      .prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(record.id, record.userId, record.tokenHash, record.expiresAt, this.clock.nowSeconds())
      .run()
  }

  async findActiveByHash(tokenHash: string, nowTimestamp: number): Promise<RefreshTokenRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, user_id, token_hash, expires_at, created_at, revoked_at
         FROM refresh_tokens
         WHERE token_hash = ? AND expires_at > ? AND revoked_at IS NULL
         LIMIT 1`
      )
      .bind(tokenHash, nowTimestamp)
      .first<RefreshTokenRow>()
    return row ? rowToRecord(row) : null
  }

  async revokeByHash(tokenHash: string, nowTimestamp: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = ?
         WHERE token_hash = ? AND revoked_at IS NULL AND expires_at >= ?`
      )
      .bind(nowTimestamp, tokenHash, nowTimestamp)
      .run()
    const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
    return changes > 0
  }

  async revokeAllForUser(userId: string, nowTimestamp: number): Promise<void> {
    await this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(nowTimestamp, userId)
      .run()
  }

  async listActiveForUser(userId: string, nowTimestamp: number, limit: number): Promise<ActiveSessionSummary[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, created_at, expires_at FROM refresh_tokens
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .bind(userId, nowTimestamp, limit)
      .all<SessionSummaryRow>()
    return (results ?? []).map(row => ({ id: row.id, createdAt: row.created_at, expiresAt: row.expires_at }))
  }

  async revokeById(sessionId: string, userId: string, nowTimestamp: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        'UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL'
      )
      .bind(nowTimestamp, sessionId, userId)
      .run()
    const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
    return changes > 0
  }
}
