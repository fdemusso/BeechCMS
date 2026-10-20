// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Regression guard for editing an already-applied migration file (#462).
 * 0000_v040_base.sql shipped in v0.8.0 and was already applied on any 0.8.0
 * deployment. Wrangler tracks applied migrations by file name, so an upgrade
 * never re-runs 0000 even if its content changes later. These tests replay
 * that exact upgrade path against real (embedded) SQLite.
 */

import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../../../migrations')
const LEGACY_BASE_SQL = readFileSync(
  join(__dirname, '../../../../test/fixtures/legacy-migrations/0000_v040_base.sql'),
  'utf8',
)

// The only migrations present in the repository at the v0.8.0 tag.
const V080_FILES = ['0000_v040_base.sql', '0030_test_seeds.sql']

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
}

function allMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()
}

function schemaOf(db: DatabaseSync) {
  return db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
}

describe('apps/api/migrations — upgrading a v0.8.0 database', () => {
  it('applying only the migrations added after v0.8.0 reproduces the same schema as a fresh install', () => {
    const postV080Files = allMigrationFiles().filter(f => !V080_FILES.includes(f))

    // Replays what wrangler actually does on an upgrade: the migrations that were
    // already applied at v0.8.0 (0000, 0030) are never re-run, only the ones added since.
    const upgraded = new DatabaseSync(':memory:')
    upgraded.exec(LEGACY_BASE_SQL)
    upgraded.exec(readMigration('0030_test_seeds.sql'))
    for (const file of postV080Files) upgraded.exec(readMigration(file))

    const fresh = new DatabaseSync(':memory:')
    for (const file of allMigrationFiles()) fresh.exec(readMigration(file))

    // The regression this guards: RBAC tables and users.is_active were appended in place
    // to 0000_v040_base.sql instead of a new migration, so an upgrading instance (which
    // never re-runs 0000) ended up missing them entirely — see #462.
    expect(schemaOf(upgraded)).toEqual(schemaOf(fresh))

    upgraded.close()
    fresh.close()
  })

  it('0000_v040_base.sql is byte-identical to what shipped in v0.8.0', () => {
    const currentBaseSql = readMigration('0000_v040_base.sql')

    expect(currentBaseSql).toBe(LEGACY_BASE_SQL)
  })
})
