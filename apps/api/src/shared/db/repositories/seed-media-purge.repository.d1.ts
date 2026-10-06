// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { generateSeedPurgeGuards } from '@beechcms/core'
import type { ISeedMediaPurgeRepository, Seed, SeedPurgeJob, SeedPurgePhase, SeedPurgeRow } from '@beechcms/core'

interface JobRow {
  id: string
  slug: string
  definition: string
  phase: SeedPurgePhase
  cursor: number
  staged_count: number
  purged_count: number
}

function toJob(row: JobRow): SeedPurgeJob {
  return {
    id: row.id,
    slug: row.slug,
    definition: JSON.parse(row.definition) as Seed,
    phase: row.phase,
    cursor: row.cursor,
    stagedCount: row.staged_count,
    purgedCount: row.purged_count,
  }
}

function assertIdentifier(value: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`Unsafe identifier: ${value}`)
}

export class D1SeedMediaPurgeRepository implements ISeedMediaPurgeRepository {
  constructor(private readonly db: D1Database) {}

  async begin(id: string, seed: Seed, now: number): Promise<void> {
    const guards = generateSeedPurgeGuards(seed)
    await this.db.batch([
      this.db.prepare(`INSERT INTO seed_meta (id, value)
        SELECT 'registry_version', 'stale-seed-purge' WHERE NOT EXISTS (
          SELECT 1 FROM seeds WHERE slug = ? AND status = 'active'
        )`).bind(seed.slug),
      this.db.prepare(`INSERT INTO seed_media_purge_jobs
        (id, slug, definition, phase, created_at, updated_at) VALUES (?, ?, ?, 'live', ?, ?)`)
        .bind(id, seed.slug, JSON.stringify(seed), now, now),
      ...guards.create.map(sql => this.db.prepare(sql)),
      this.db.prepare(`UPDATE seeds SET status = 'deleted', updated_at = ? WHERE slug = ? AND status = 'active'`)
        .bind(now, seed.slug),
      this.db.prepare(`UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
        WHERE id = 'registry_version'`),
    ])
  }

  async get(id: string): Promise<SeedPurgeJob | null> {
    const row = await this.db.prepare('SELECT * FROM seed_media_purge_jobs WHERE id = ?')
      .bind(id).first<JobRow>()
    return row ? toJob(row) : null
  }

  async getActiveBySlug(slug: string): Promise<SeedPurgeJob | null> {
    const row = await this.db.prepare(`SELECT * FROM seed_media_purge_jobs
      WHERE slug = ? AND phase IN ('live', 'drafts', 'purging') LIMIT 1`).bind(slug).first<JobRow>()
    return row ? toJob(row) : null
  }

  async listPendingIds(limit: number): Promise<string[]> {
    const rows = await this.db.prepare(`SELECT id FROM seed_media_purge_jobs WHERE phase IN ('live', 'drafts', 'purging')
      ORDER BY updated_at ASC LIMIT ?`).bind(limit).all<{ id: string }>()
    return (rows.results ?? []).map(row => row.id)
  }

  async claim(id: string, token: string, now: number, leaseSeconds: number): Promise<SeedPurgeJob | null> {
    const row = await this.db.prepare(`UPDATE seed_media_purge_jobs
      SET lease_token = ?, lease_until = ?, updated_at = ?
      WHERE id = ? AND phase IN ('live', 'drafts', 'purging') AND lease_until < ? RETURNING *`)
      .bind(token, now + leaseSeconds, now, id, now).first<JobRow>()
    return row ? toJob(row) : null
  }

  async release(id: string, token: string): Promise<void> {
    await this.db.prepare(`UPDATE seed_media_purge_jobs SET lease_token = NULL, lease_until = 0
      WHERE id = ? AND lease_token = ?`).bind(id, token).run()
  }

  async getColumns(table: string): Promise<Set<string> | null> {
    assertIdentifier(table)
    const rows = await this.db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    return rows.results?.length ? new Set(rows.results.map(row => row.name)) : null
  }

  async readPage(table: string, columns: string[], cursor: number, limit: number): Promise<SeedPurgeRow[]> {
    assertIdentifier(table)
    for (const column of columns) assertIdentifier(column)
    const projection = columns.length ? `, ${columns.join(', ')}` : ''
    const rows = await this.db.prepare(`SELECT rowid AS _purge_rowid${projection} FROM ${table}
      WHERE rowid > ? ORDER BY rowid LIMIT ?`).bind(cursor, limit)
      .all<Record<string, unknown> & { _purge_rowid: number }>()
    return (rows.results ?? []).map(({ _purge_rowid, ...data }) => ({ rowid: _purge_rowid, data }))
  }

  async stagePage(id: string, token: string, cursor: number, keys: string[], now: number): Promise<void> {
    const unique = [...new Set(keys)]
    const guard = this.db.prepare(`INSERT INTO seed_meta (id, value)
      SELECT 'registry_version', 'stale-purge-lease' WHERE NOT EXISTS (
        SELECT 1 FROM seed_media_purge_jobs WHERE id = ? AND lease_token = ?
          AND phase IN ('live', 'drafts') AND lease_until >= ?
      )`).bind(id, token, now)
    const statements: D1PreparedStatement[] = [guard]
    for (let index = 0; index < unique.length; index += 100) {
      const chunk = unique.slice(index, index + 100)
      const values = chunk.map(() => '(?, ?)').join(', ')
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO seed_media_purge_keys (job_id, object_key)
        VALUES ${values}`).bind(...chunk.flatMap(key => [id, key])))
    }
    statements.push(this.db.prepare(`UPDATE seed_media_purge_jobs SET cursor = ?, updated_at = ?,
      staged_count = (SELECT COUNT(*) FROM seed_media_purge_keys WHERE job_id = ?)
      WHERE id = ? AND lease_token = ?`).bind(cursor, now, id, id, token))
    await this.db.batch(statements)
  }

  async moveToDrafts(id: string, token: string, now: number): Promise<void> {
    await this.db.prepare(`UPDATE seed_media_purge_jobs SET phase = 'drafts', cursor = 0, updated_at = ?
      WHERE id = ? AND lease_token = ? AND phase = 'live'`).bind(now, id, token).run()
  }

  async dropAndStartPurge(id: string, token: string, statements: string[], now: number): Promise<void> {
    const guard = this.db.prepare(`INSERT INTO seed_meta (id, value)
      SELECT 'registry_version', 'stale-purge-lease' WHERE NOT EXISTS (
        SELECT 1 FROM seed_media_purge_jobs WHERE id = ? AND lease_token = ?
          AND phase IN ('live', 'drafts') AND lease_until >= ?
      )`).bind(id, token, now)
    const drop = statements.map(sql => this.db.prepare(sql))
    const deleteSeed = this.db.prepare(`DELETE FROM seeds WHERE slug =
      (SELECT slug FROM seed_media_purge_jobs WHERE id = ?)`).bind(id)
    const bump = this.db.prepare(`UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
      WHERE id = 'registry_version'`)
    const advance = this.db.prepare(`UPDATE seed_media_purge_jobs SET phase = 'purging', cursor = 0,
      updated_at = ? WHERE id = ? AND lease_token = ?`).bind(now, id, token)
    await this.db.batch([guard, ...drop, deleteSeed, bump, advance])
  }

  async abortDrop(id: string, token: string, now: number): Promise<void> {
    const job = await this.get(id)
    if (!job) throw new Error(`Seed purge job '${id}' disappeared before rollback`)
    const guards = generateSeedPurgeGuards(job.definition)
    const guard = this.db.prepare(`INSERT INTO seed_meta (id, value)
      SELECT 'registry_version', 'stale-purge-lease' WHERE NOT EXISTS (
        SELECT 1 FROM seed_media_purge_jobs WHERE id = ? AND lease_token = ?
          AND phase IN ('live', 'drafts')
      )`).bind(id, token)
    const fail = this.db.prepare(`UPDATE seed_media_purge_jobs SET phase = 'failed', updated_at = ?
      WHERE id = ? AND lease_token = ?`).bind(now, id, token)
    const restore = this.db.prepare(`UPDATE seeds SET status = 'active', updated_at = ? WHERE slug =
      (SELECT slug FROM seed_media_purge_jobs WHERE id = ?)`).bind(now, id)
    const bump = this.db.prepare(`UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
      WHERE id = 'registry_version'`)
    const clear = this.db.prepare('DELETE FROM seed_media_purge_keys WHERE job_id = ?').bind(id)
    await this.db.batch([guard, fail, ...guards.drop.map(sql => this.db.prepare(sql)), restore, bump, clear])
  }

  async listKeys(id: string, limit: number): Promise<string[]> {
    const rows = await this.db.prepare(`SELECT object_key FROM seed_media_purge_keys
      WHERE job_id = ? ORDER BY object_key LIMIT ?`).bind(id, limit).all<{ object_key: string }>()
    return (rows.results ?? []).map(row => row.object_key)
  }

  async completeKey(id: string, token: string, key: string, now: number): Promise<void> {
    const guard = this.db.prepare(`INSERT INTO seed_meta (id, value)
      SELECT 'registry_version', 'stale-purge-lease' WHERE NOT EXISTS (
        SELECT 1 FROM seed_media_purge_jobs WHERE id = ? AND lease_token = ? AND phase = 'purging'
      )`).bind(id, token)
    const decrement = this.db.prepare(`UPDATE system_stats SET value = MAX(0, CAST(value AS INTEGER) -
      COALESCE((SELECT size_bytes FROM media_objects WHERE key = ?), 0))
      WHERE id = 'total_storage_bytes' AND EXISTS (
        SELECT 1 FROM seed_media_purge_keys WHERE job_id = ? AND object_key = ?
      )`).bind(key, id, key)
    const untrack = this.db.prepare(`DELETE FROM media_objects WHERE key = ? AND EXISTS (
      SELECT 1 FROM seed_media_purge_keys WHERE job_id = ? AND object_key = ?
    )`).bind(key, id, key)
    const ack = this.db.prepare('DELETE FROM seed_media_purge_keys WHERE job_id = ? AND object_key = ?')
      .bind(id, key)
    const update = this.db.prepare(`UPDATE seed_media_purge_jobs SET updated_at = ?, purged_count =
      staged_count - (SELECT COUNT(*) FROM seed_media_purge_keys WHERE job_id = ?)
      WHERE id = ? AND lease_token = ?`).bind(now, id, id, token)
    await this.db.batch([guard, decrement, untrack, ack, update])
  }

  async finish(id: string, token: string, now: number): Promise<void> {
    await this.db.prepare(`UPDATE seed_media_purge_jobs SET phase = 'done', updated_at = ?,
      lease_token = NULL, lease_until = 0
      WHERE id = ? AND lease_token = ? AND phase = 'purging'
        AND NOT EXISTS (SELECT 1 FROM seed_media_purge_keys WHERE job_id = ?)`)
      .bind(now, id, token, id).run()
  }
}
