import { IdempotencyRepository, IdempotencyRecord } from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1.js'

export class D1IdempotencyRepository extends BaseD1Repository implements IdempotencyRepository {
  async lookup(key: string): Promise<IdempotencyRecord | null> {
    const row = await this.db.prepare(
      `SELECT idempotency_key, request_fingerprint, response_status, response_body, expires_at
       FROM public_idempotency_keys WHERE idempotency_key = ? LIMIT 1`
    ).bind(key).first<any>()

    if (!row) return null

    return {
      key: row.idempotency_key,
      fingerprint: row.request_fingerprint,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      expiresAt: row.expires_at
    }
  }

  async store(record: IdempotencyRecord): Promise<void> {
    await this.db.prepare(
      `INSERT INTO public_idempotency_keys (idempotency_key, request_fingerprint, response_status, response_body, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO UPDATE SET
         request_fingerprint = excluded.request_fingerprint,
         response_status = excluded.response_status,
         response_body = excluded.response_body,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`
    ).bind(
      record.key, 
      record.fingerprint, 
      record.responseStatus, 
      record.responseBody, 
      Math.floor(Date.now() / 1000), 
      record.expiresAt
    ).run()
  }

  async cleanup(now: number): Promise<void> {
    await this.db.prepare(`DELETE FROM public_idempotency_keys WHERE expires_at < ?`).bind(now).run()
  }
}
