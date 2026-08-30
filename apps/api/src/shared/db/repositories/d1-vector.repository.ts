// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Seed, IVectorRepository } from '@beechcms/core'
import { vectorTableName } from '@beechcms/core'

export class D1VectorRepository implements IVectorRepository {
  constructor(private readonly db: D1Database) {}

  async saveVector(seed: Seed, entryId: string, vector: Float32Array): Promise<void> {
    const table = vectorTableName(seed)
    const blob = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength)
    await this.db
      .prepare(
        `INSERT INTO ${table} (entry_id, vector) VALUES (?, ?) ON CONFLICT(entry_id) DO UPDATE SET vector = ?`,
      )
      .bind(entryId, blob, blob)
      .run()
  }

  async deleteVector(seed: Seed, entryId: string): Promise<void> {
    const table = vectorTableName(seed)
    await this.db.prepare(`DELETE FROM ${table} WHERE entry_id = ?`).bind(entryId).run()
  }

  async getAllVectors(seed: Seed): Promise<{ entryId: string; vector: Float32Array }[]> {
    const table = vectorTableName(seed)
    const { results } = await this.db
      .prepare(`SELECT entry_id, vector FROM ${table}`)
      .all<{ entry_id: string; vector: ArrayBuffer | ArrayBufferView | number[] }>()

    return (results ?? []).map((row) => {
      let float32: Float32Array
      if (row.vector instanceof ArrayBuffer) {
        float32 = new Float32Array(row.vector)
      } else if (ArrayBuffer.isView(row.vector)) {
        float32 = new Float32Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
        )
      } else if (Array.isArray(row.vector)) {
        const u8 = new Uint8Array(row.vector)
        float32 = new Float32Array(
          u8.buffer,
          u8.byteOffset,
          u8.byteLength / Float32Array.BYTES_PER_ELEMENT,
        )
      } else {
        float32 = new Float32Array(0)
      }

      return {
        entryId: row.entry_id,
        vector: float32,
      }
    })
  }
}
