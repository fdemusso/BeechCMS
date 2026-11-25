#!/usr/bin/env node
/**
 * Idempotent D1 migrator for local dev (`pnpm beech db:migrate`, `pnpm beech dev`, e2e reset).
 *
 * Applies every migration in apps/api/migrations that the local D1 has not recorded yet, in order,
 * one transaction per file. Applied files are recorded in `d1_migrations`, the table wrangler's own
 * `d1 migrations apply` and deploy use, so all three paths agree on what has run.
 *
 * Safe to run repeatedly: a fully migrated DB is a no-op. A failing migration aborts with exit 1.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_DIR = join(__dirname, '..')

// Non-default persist root (the e2e tier points this at a throwaway directory so a run never
// touches a developer's local dev database). Absent → today's wrangler default, unchanged.
const PERSIST_ROOT = process.env.BEECH_D1_PERSIST_DIR
  ? resolve(process.env.BEECH_D1_PERSIST_DIR)
  : join(API_DIR, '.wrangler/state')
const PERSIST_FLAG = process.env.BEECH_D1_PERSIST_DIR ? ` --persist-to "${PERSIST_ROOT}"` : ''

const D1_DIR = join(PERSIST_ROOT, 'v3/d1/miniflare-D1DatabaseObject')
// Test seam, same idea as BEECH_D1_PERSIST_DIR: lets the script suite drive controlled migration files.
const MIGRATIONS_DIR = process.env.BEECH_D1_MIGRATIONS_DIR
  ? resolve(process.env.BEECH_D1_MIGRATIONS_DIR)
  : join(API_DIR, 'migrations')
// Wrangler's tracking table, with its exact DDL.
const MIGRATIONS_TABLE = 'd1_migrations'

function getSqliteFilePath() {
  if (!existsSync(D1_DIR)) return null
  const files = readdirSync(D1_DIR)
  const sqliteFile = files.find(f => f.endsWith('.sqlite') && !f.startsWith('metadata'))
  return sqliteFile ? join(D1_DIR, sqliteFile) : null
}

function ensureWranglerD1Initialized() {
  let filePath = getSqliteFilePath()
  if (!filePath) {
    try {
      execSync(
        `npx wrangler d1 execute beech-db --local --command "SELECT 1"${PERSIST_FLAG}`,
        { cwd: API_DIR, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
      )
    } catch {
      // ignore initialization attempt errors
    }
    filePath = getSqliteFilePath()
  }
  return filePath
}

function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
}

function fail(message) {
  console.error(`[bootstrap-d1] ✗ ${message}`)
  process.exit(1)
}

function applyPendingMigrations(db) {
  // A schema without tracking was built by the old bootstrap, which never recorded what it ran.
  // Re-running every file would break on ALTER/DROP, and guessing the applied prefix would hide drift.
  if (hasTable(db, 'users') && !hasTable(db, MIGRATIONS_TABLE)) {
    fail(
      'local D1 has a schema but no migration history (created before migration tracking), so the ' +
        'applied migrations are unknown. Wipe it with `pnpm beech db:reset`.'
    )
  }

  db.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`)

  const recorded = new Set(db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all().map(row => row.name))
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()
  const pending = files.filter(f => !recorded.has(f))

  if (pending.length === 0) {
    console.log(`[bootstrap-d1] DB up to date (${files.length} migrations recorded) — nothing to apply.`)
    return 0
  }

  const record = db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`)
  for (const f of pending) {
    console.log(`[bootstrap-d1] applying ${f}`)
    try {
      db.exec('BEGIN')
      db.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      record.run(f)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      fail(`${f} failed and was rolled back: ${err.message}`)
    }
  }
  return pending.length
}

const filePath = ensureWranglerD1Initialized()
if (!filePath) fail('could not find or create the local D1 database file.')

const db = new DatabaseSync(filePath)
const applied = applyPendingMigrations(db)
db.close()

console.log(`[bootstrap-d1] done. (${applied} applied)`)
