// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Black-box suite for apps/api/scripts/bootstrap-d1.mjs (`pnpm beech db:migrate`, `pnpm beech dev`).
 * Spawns the real script against a throwaway persist dir and a controlled migrations dir, so it
 * proves what a developer's local D1 looks like after each run. Wrangler itself is never invoked.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const BOOTSTRAP = join(ROOT, 'apps/api/scripts/bootstrap-d1.mjs')

describe('bootstrap-d1', () => {
  const scratchDirs = []

  afterEach(() => {
    for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  // The persist dir already holds an empty D1 file, so the script skips the `wrangler d1 execute`
  // call it otherwise makes to create one (needs npx, takes seconds, irrelevant to what is proven here).
  function createWorld(migrations) {
    const root = mkdtempSync(join(tmpdir(), 'bootstrap-d1-'))
    scratchDirs.push(root)
    const persistDir = join(root, 'state')
    const migrationsDir = join(root, 'migrations')
    const d1Dir = join(persistDir, 'v3/d1/miniflare-D1DatabaseObject')
    mkdirSync(d1Dir, { recursive: true })
    mkdirSync(migrationsDir)
    const sqlitePath = join(d1Dir, 'local.sqlite')
    const db = new DatabaseSync(sqlitePath)
    db.exec('CREATE TABLE _probe (x); DROP TABLE _probe')
    db.close()
    const world = { persistDir, migrationsDir, sqlitePath }
    writeMigrations(world, migrations)
    return world
  }

  function writeMigrations(world, migrations) {
    for (const [name, sql] of Object.entries(migrations)) writeFileSync(join(world.migrationsDir, name), sql)
  }

  function runBootstrap(world) {
    return spawnSync(process.execPath, [BOOTSTRAP], {
      cwd: join(ROOT, 'apps/api'),
      encoding: 'utf8',
      env: { ...process.env, BEECH_D1_PERSIST_DIR: world.persistDir, BEECH_D1_MIGRATIONS_DIR: world.migrationsDir },
    })
  }

  function appliedNames(result) {
    return [...result.stdout.matchAll(/\[bootstrap-d1\] applying (\S+)/g)].map((match) => match[1])
  }

  function readDb(world, sql) {
    const db = new DatabaseSync(world.sqlitePath)
    try {
      return db.prepare(sql).all()
    } finally {
      db.close()
    }
  }

  const tableNames = (world) =>
    readDb(world, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name)

  const recordedMigrations = (world) => readDb(world, 'SELECT name FROM d1_migrations ORDER BY id').map((row) => row.name)

  it('a DB initialised before a migration existed receives it on the next run, and only it', () => {
    const world = createWorld({ '0000_alpha.sql': 'CREATE TABLE alpha (id INTEGER PRIMARY KEY);' })
    assert.equal(runBootstrap(world).status, 0)
    writeMigrations(world, { '0001_beta.sql': 'CREATE TABLE beta (id INTEGER PRIMARY KEY);' })

    const result = runBootstrap(world)

    assert.equal(result.status, 0)
    assert.deepEqual(appliedNames(result), ['0001_beta.sql'])
    assert.ok(tableNames(world).includes('beta'), 'the pending migration must have created its table')
    assert.deepEqual(recordedMigrations(world), ['0000_alpha.sql', '0001_beta.sql'])
  })

  it('a fully migrated DB is left alone and applies nothing', () => {
    const world = createWorld({ '0000_alpha.sql': 'CREATE TABLE alpha (id INTEGER PRIMARY KEY);' })
    assert.equal(runBootstrap(world).status, 0)

    const result = runBootstrap(world)

    assert.equal(result.status, 0)
    assert.deepEqual(appliedNames(result), [])
    assert.deepEqual(recordedMigrations(world), ['0000_alpha.sql'])
  })

  it('a failing migration exits non-zero, rolls back its partial effects and is not recorded', () => {
    const world = createWorld({
      '0000_alpha.sql': 'CREATE TABLE alpha (id INTEGER PRIMARY KEY);',
      '0001_broken.sql': 'CREATE TABLE half (id INTEGER PRIMARY KEY); INSERT INTO missing_table VALUES (1);',
    })

    const result = runBootstrap(world)

    assert.equal(result.status, 1)
    assert.deepEqual(recordedMigrations(world), ['0000_alpha.sql'])
    assert.ok(!tableNames(world).includes('half'), 'the failed migration must leave no table behind')
  })

  it('a DB that predates migration tracking is refused instead of reported as migrated', () => {
    const world = createWorld({ '0000_alpha.sql': 'CREATE TABLE alpha (id INTEGER PRIMARY KEY);' })
    const legacy = new DatabaseSync(world.sqlitePath)
    legacy.exec('CREATE TABLE users (id TEXT PRIMARY KEY)')
    legacy.close()

    const result = runBootstrap(world)

    assert.equal(result.status, 1)
    assert.deepEqual(appliedNames(result), [])
    assert.ok(!tableNames(world).includes('alpha'), 'nothing may be applied on top of an untracked schema')
    assert.ok(!tableNames(world).includes('d1_migrations'), 'the DB must be left exactly as found')
  })
})
