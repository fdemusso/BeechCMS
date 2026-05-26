// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { SystemStatsRepository } from '@beechcms/core'

/**
 * Implementation of SystemStatsRepository using Cloudflare D1.
 * Manages global system statistics such as total storage usage.
 */
export class D1SystemStatsRepository implements SystemStatsRepository {
  constructor(private database: D1Database) {}

  /**
   * Increments the total storage usage count.
   */
  async incrementStorage(byteCount: number): Promise<void> {
    await this.database.prepare(
      "UPDATE system_stats SET value = CAST(value AS INTEGER) + ? WHERE id = 'total_storage_bytes'"
    ).bind(byteCount).run()
  }

  /**
   * Decrements the total storage usage count, ensuring it doesn't fall below zero.
   */
  async decrementStorage(byteCount: number): Promise<void> {
    await this.database.prepare(
      "UPDATE system_stats SET value = MAX(0, CAST(value AS INTEGER) - ?) WHERE id = 'total_storage_bytes'"
    ).bind(byteCount).run()
  }

  /**
   * Sets the total storage usage count to a specific value.
   */
  async setStorage(byteCount: number): Promise<void> {
    await this.database.prepare(
      "UPDATE system_stats SET value = ? WHERE id = 'total_storage_bytes'"
    ).bind(String(byteCount)).run()
  }

  /**
   * Retrieves the current total storage usage in bytes.
   */
  async getStorageUsage(): Promise<number> {
    const statsRecordResult = await this.database.prepare("SELECT value FROM system_stats WHERE id = 'total_storage_bytes'").first<{ value: string }>()
    return statsRecordResult ? parseInt(statsRecordResult.value, 10) : 0
  }
}
