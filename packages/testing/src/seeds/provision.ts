// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { planCreateSeed, GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME, type Seed } from '@beechcms/core'
import type { TestHarness } from '../harness'
import { CANONICAL_SEEDS } from './canonical.seeds'
import { CANONICAL_ENTRIES, CANONICAL_USERS, UUID_V4_PATTERN, type CanonicalEntry, type CanonicalUser } from './canonical.data'

const UPSERT_SEED_SQL = `
  INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
  VALUES (?, ?, 'active', 'code', ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    definition = excluded.definition,
    status     = 'active',
    updated_at = excluded.updated_at
`

/**
 * Clears content rows left behind by a prior test. `@cloudflare/vitest-pool-workers`'s
 * pool architecture (0.22.x) isolates D1 storage per test *file*, not per test — with no
 * config knob to change that — so two tests that both seed the same canonical slug in the
 * same file collide on `content_{slug}.slug`'s UNIQUE constraint. Physical table names
 * (`content_{slug}`, `content_{slug}_drafts`) are the documented convention (see
 * `_config/database_workflow.md`), not a hand-invented schema detail.
 */
export async function resetContentTables(db: D1Database, seeds: readonly Seed[]): Promise<void> {
  for (const seed of seeds) {
    for (const table of [`content_${seed.slug}`, `content_${seed.slug}_drafts`]) {
      try {
        await db.prepare(`DELETE FROM ${table}`).run()
      } catch {
        // Table doesn't exist for this seed (e.g. allowDrafts: false) — nothing to clear.
      }
    }
  }
}

/**
 * Registers seeds in the `seeds` table (so seedRegistryMiddleware hydrates them from D1)
 * and materializes their physical storage via the engine's DDL planner.
 */
export async function provisionSeeds(
  db: D1Database,
  seeds: readonly Seed[] = CANONICAL_SEEDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  for (const seed of seeds) {
    for (const statement of planCreateSeed(seed)) {
      await db.exec(statement.replace(/\n/g, ' '))
    }
    await db.prepare(UPSERT_SEED_SQL)
      .bind(seed.slug, JSON.stringify(seed), nowSeconds, nowSeconds)
      .run()
  }
}

/**
 * Inserts canonical users and grants SuperAdmin at global scope. Mirrors
 * `apps/api/test/helpers/seed-fixtures.ts`: role ids are minted per-database by
 * 0000_v040_base.sql, so they are resolved by name, never hardcoded.
 */
export async function seedUsers(
  db: D1Database,
  users: readonly CanonicalUser[] = Object.values(CANONICAL_USERS),
): Promise<void> {
  for (const user of users) {
    await db.prepare(
      'INSERT OR IGNORE INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)',
    ).bind(user.id, user.email, user.passwordHash, user.role, user.name).run()

    const grant = user.grantSuperAdmin ?? user.role === 'admin'
    if (!grant) continue

    await db.prepare(
      `INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
       SELECT ?, ?, r.id, ? FROM roles r WHERE r.name = ?`,
    ).bind(`ura_${user.id}`, user.id, GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME).run()
  }
}

export interface SeededCanonicalEntry extends CanonicalEntry {
  readonly id: string
}

/**
 * Inserts canonical entries through the real `POST /api/content/:slug` route (as
 * the admin client), so the Botanical Engine's `apiToDb` path is exercised on the
 * way in. Entry ids are never client-supplied — production mints them server-side —
 * so each minted id is verified against {@link UUID_V4_PATTERN} here.
 */
export async function seedCanonicalEntries(
  harness: TestHarness,
  entries: readonly CanonicalEntry[] = CANONICAL_ENTRIES,
): Promise<SeededCanonicalEntry[]> {
  const admin = await harness.asUser('admin')
  const seeded: SeededCanonicalEntry[] = []

  for (const entry of entries) {
    const response = await admin.post(`/api/content/${entry.seedSlug}`, entry.data)
    if (response.status !== 201) {
      throw new Error(`seedCanonicalEntries: POST /api/content/${entry.seedSlug} returned ${response.status}`)
    }
    const { id } = await response.json<{ id: string }>()
    if (!UUID_V4_PATTERN.test(id)) {
      throw new Error(`seedCanonicalEntries: minted id "${id}" is not UUIDv4`)
    }
    seeded.push({ ...entry, id })
  }

  return seeded
}
