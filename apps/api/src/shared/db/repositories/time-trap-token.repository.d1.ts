// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { ITimeTrapTokenRepository } from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1.js'

export class D1TimeTrapTokenRepository extends BaseD1Repository implements ITimeTrapTokenRepository {
  async isTokenUsed(tokenHash: string): Promise<boolean> {
    if (!this.database) return false
    const row = await this.database
      .prepare('SELECT token_hash FROM public_time_trap_tokens WHERE token_hash = ? LIMIT 1')
      .bind(tokenHash)
      .first<{ token_hash: string }>()
    return row !== null
  }

  async markTokenUsed(tokenHash: string, usedAt: number, expiresAt: number): Promise<void> {
    if (!this.database) return
    await this.database
      .prepare(
        `INSERT INTO public_time_trap_tokens (token_hash, used_at, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(token_hash) DO UPDATE SET used_at = excluded.used_at`
      )
      .bind(tokenHash, usedAt, expiresAt)
      .run()
  }

  async cleanup(nowSeconds: number): Promise<void> {
    if (!this.database) return
    await this.database
      .prepare('DELETE FROM public_time_trap_tokens WHERE expires_at < ?')
      .bind(nowSeconds)
      .run()
  }
}
