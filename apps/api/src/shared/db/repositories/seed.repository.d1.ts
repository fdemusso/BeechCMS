// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { ISeedRepository, SeedRecord, Seed, SeedApplyInput, SeedApplyResult } from '@beechcms/core'

export class D1SeedRepository implements ISeedRepository {
  private static readonly UPSERT_SEED_SQL = `
    INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
    VALUES (?, ?, 'active', ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      definition = excluded.definition,
      status     = 'active',
      updated_at = excluded.updated_at
  `

  constructor(private readonly db: D1Database) {}

  async listActive(): Promise<Seed[]> {
    const rs = await this.db
      .prepare(`SELECT definition FROM seeds WHERE status = 'active' ORDER BY created_at ASC`)
      .all<{ definition: string }>()
    const seeds: Seed[] = []
    for (const r of rs.results ?? []) {
      try { seeds.push(JSON.parse(r.definition) as Seed) } catch { /* skip corrupt */ }
    }
    return seeds
  }

  async listAll(): Promise<SeedRecord[]> {
    const rs = await this.db
      .prepare(`SELECT slug, definition, status, source, created_at, updated_at FROM seeds ORDER BY created_at ASC`)
      .all<{ slug: string; definition: string; status: string; source: string; created_at: number; updated_at: number }>()
    const out: SeedRecord[] = []
    for (const r of rs.results ?? []) {
      try {
        out.push({
          slug: r.slug,
          definition: JSON.parse(r.definition) as Seed,
          status: r.status as 'active' | 'deleted',
          source: r.source as 'code' | 'runtime',
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })
      } catch { /* skip corrupt */ }
    }
    return out
  }

  async get(slug: string): Promise<SeedRecord | null> {
    const r = await this.db
      .prepare(`SELECT slug, definition, status, source, created_at, updated_at FROM seeds WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ slug: string; definition: string; status: string; source: string; created_at: number; updated_at: number }>()
    if (!r) return null
    try {
      return {
        slug: r.slug,
        definition: JSON.parse(r.definition) as Seed,
        status: r.status as 'active' | 'deleted',
        source: r.source as 'code' | 'runtime',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }
    } catch {
      return null
    }
  }

  async upsert(slug: string, definition: Seed, source: 'code' | 'runtime' = 'runtime'): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(D1SeedRepository.UPSERT_SEED_SQL)
      .bind(slug, JSON.stringify(definition), source, now, now)
      .run()
  }

  async softDelete(slug: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(`UPDATE seeds SET status = 'deleted', updated_at = ? WHERE slug = ?`)
      .bind(now, slug)
      .run()
  }

  async hardDelete(slug: string): Promise<void> {
    await this.db.prepare(`DELETE FROM seeds WHERE slug = ?`).bind(slug).run()
  }

  async getRegistryVersion(): Promise<number> {
    const r = await this.db
      .prepare(`SELECT value FROM seed_meta WHERE id = 'registry_version' LIMIT 1`)
      .first<{ value: string }>()
    return r ? parseInt(r.value, 10) || 1 : 1
  }

  async bumpRegistryVersion(): Promise<number> {
    const r = await this.db
      .prepare(`UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version' RETURNING value`)
      .first<{ value: string }>()
    return r ? parseInt(r.value, 10) : 1
  }

  async applyAtomic(input: SeedApplyInput): Promise<SeedApplyResult> {
    const { slug, definition, ddl, expectedVersion, source = 'runtime' } = input
    const now = Math.floor(Date.now() / 1000)

    // CAS guard. `seed_meta.id` is a PRIMARY KEY, so when the version does NOT match, this
    // statement attempts to insert a duplicate 'registry_version' row and raises a UNIQUE
    // constraint error, which aborts and rolls back the whole batch. When the version DOES
    // match, the SELECT yields zero rows and the statement is a no-op.
    // This is what makes the check atomic: reading the version in a separate round-trip and
    // comparing it in JS is a TOCTOU race between two concurrent agents.
    const guard = this.db
      .prepare(
        `INSERT INTO seed_meta (id, value)
         SELECT 'registry_version', 'occ-conflict'
         WHERE (SELECT value FROM seed_meta WHERE id = 'registry_version') <> CAST(? AS TEXT)`
      )
      .bind(expectedVersion)

    const upsert = this.db
      .prepare(D1SeedRepository.UPSERT_SEED_SQL)
      .bind(slug, JSON.stringify(definition), source, now, now)

    const bump = this.db.prepare(
      `UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
       WHERE id = 'registry_version'`
    )

    try {
      // Order matters: the guard must be the FIRST statement so nothing is written when it trips.
      await this.db.batch([guard, ...ddl.map(s => this.db.prepare(s)), upsert, bump])
      return { applied: true, version: expectedVersion + 1 }
    } catch (error) {
      // Distinguish "someone else moved the version" from a genuine DDL failure.
      const message = error instanceof Error ? error.message : String(error)
      if (/UNIQUE constraint failed: seed_meta\.id/i.test(message)) {
        return { applied: false, version: await this.getRegistryVersion() }
      }
      throw error
    }
  }
}
