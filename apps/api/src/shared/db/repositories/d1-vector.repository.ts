// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Seed, IVectorRepository } from '@beechcms/core'
import { vectorTableName, tableName, resolvePolicies } from '@beechcms/core'

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

  async getAllVectors(seed: Seed): Promise<StoredVector[]> {
    const { sql } = this.selectVectors(seed)
    const { results } = await this.db.prepare(sql).all<VectorRow>()
    return (results ?? []).map(decodeVectorRow)
  }

  /**
   * Keyset page ordered by `entry_id`, so a caller bounds how many BLOBs one query materialises.
   * Pass the last returned `entryId` as `afterEntryId` to fetch the next page.
   */
  async getVectorPage(seed: Seed, afterEntryId: string | null, limit: number): Promise<StoredVector[]> {
    const { sql, keyColumn } = this.selectVectors(seed)
    const { results } = await this.db
      .prepare(`${sql} WHERE ${keyColumn} > ? ORDER BY ${keyColumn} LIMIT ?`)
      .bind(afterEntryId ?? '', limit)
      .all<VectorRow>()
    return (results ?? []).map(decodeVectorRow)
  }

  async countVectors(seed: Seed): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM ${vectorTableName(seed)}`)
      .first<{ n: number }>()
    return row?.n ?? 0
  }

  private selectVectors(seed: Seed): { sql: string; keyColumn: string } {
    const vTable = vectorTableName(seed)
    const cTable = tableName(seed)
    // The title lands in the publicly served manifest: only a publicly visible display-name branch may feed it.
    const titleBranch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
    const policies = titleBranch ? resolvePolicies(titleBranch) : null
    const titleColumn = policies?.public && policies.visibility === 'full' ? seed.displayNameAlias : null
    return titleColumn
      ? {
          sql: `SELECT v.entry_id, v.vector, c.${titleColumn} AS title FROM ${vTable} v LEFT JOIN ${cTable} c ON c.id = v.entry_id`,
          keyColumn: 'v.entry_id',
        }
      : { sql: `SELECT entry_id, vector, NULL AS title FROM ${vTable}`, keyColumn: 'entry_id' }
  }
}

interface VectorRow {
  entry_id: string
  vector: ArrayBuffer | ArrayBufferView | number[]
  title: string | null
}

export interface StoredVector {
  entryId: string
  vector: Float32Array
  title: string
}

function decodeVectorRow(row: VectorRow): StoredVector {
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

  return { entryId: row.entry_id, vector: float32, title: row.title ?? '' }
}
