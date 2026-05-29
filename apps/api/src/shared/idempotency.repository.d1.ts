// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { IdempotencyRepository, IdempotencyRecord } from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1.js'

export class D1IdempotencyRepository extends BaseD1Repository implements IdempotencyRepository {
  /**
   * Looks up an idempotency record by its key.
   */
  async lookup(idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const idempotencyRecordResult = await this.database.prepare(
      `SELECT idempotency_key, request_fingerprint, response_status, response_body, expires_at
       FROM public_idempotency_keys WHERE idempotency_key = ? LIMIT 1`
    ).bind(idempotencyKey).first<any>()

    if (!idempotencyRecordResult) {
      return null
    }

    return {
      key: idempotencyRecordResult.idempotency_key,
      fingerprint: idempotencyRecordResult.request_fingerprint,
      responseStatus: idempotencyRecordResult.response_status,
      responseBody: idempotencyRecordResult.response_body,
      expiresAt: idempotencyRecordResult.expires_at
    }
  }

  /**
   * Stores or updates an idempotency record.
   */
  async store(idempotencyData: IdempotencyRecord): Promise<void> {
    await this.database.prepare(
      `INSERT INTO public_idempotency_keys (idempotency_key, request_fingerprint, response_status, response_body, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO UPDATE SET
         request_fingerprint = excluded.request_fingerprint,
         response_status = excluded.response_status,
         response_body = excluded.response_body,
         created_at = excluded.created_at,
         expires_at = excluded.expires_at`
    ).bind(
      idempotencyData.key, 
      idempotencyData.fingerprint, 
      idempotencyData.responseStatus, 
      idempotencyData.responseBody, 
      Math.floor(Date.now() / 1000), 
      idempotencyData.expiresAt
    ).run()
  }

  /**
   * Cleans up expired idempotency records.
   */
  async cleanup(expirationTimestamp: number): Promise<void> {
    await this.database.prepare(`DELETE FROM public_idempotency_keys WHERE expires_at < ?`).bind(expirationTimestamp).run()
  }
}
