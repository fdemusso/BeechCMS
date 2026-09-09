#!/usr/bin/env node
/**
 * Idempotent D1 bootstrap for local dev.
 *
 * Runs every time `npm run dev:full` starts. Detects whether the local
 * D1 database exists and contains the base schema; if not, applies migrations
 * 0000 → latest in order.
 *
 * Safe to run repeatedly: a fully-migrated DB is a no-op.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_DIR = join(__dirname, '..')
const D1_DIR = join(API_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
const MIGRATIONS_DIR = join(API_DIR, 'migrations')

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
        `npx wrangler d1 execute beech-db --local --command "SELECT 1"`,
        { cwd: API_DIR, stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
      )
    } catch {
      // ignore initialization attempt errors
    }
    filePath = getSqliteFilePath()
  }
  return filePath
}

function hasSqliteFile() {
  return getSqliteFilePath() !== null
}

function hasBaseSchema() {
  const filePath = getSqliteFilePath()
  if (filePath) {
    try {
      const db = new DatabaseSync(filePath)
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
      return Boolean(row?.name)
    } catch {
      // fallback if SQLite open fails
    }
  }

  try {
    const out = execSync(
      `npx wrangler d1 execute beech-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"`,
      { cwd: API_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
    )
    return out.includes('users')
  } catch {
    return false
  }
}

function applyMigrationsInOrder() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()

  let applied = 0
  let skipped = 0

  const filePath = ensureWranglerD1Initialized()

  if (filePath) {
    try {
      const db = new DatabaseSync(filePath)
      for (const f of files) {
        try {
          console.log(`[bootstrap-d1] applying ${f}`)
          const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
          db.exec(sql)
          applied++
        } catch {
          console.warn(`[bootstrap-d1] ⚠  ${f} skipped`)
          skipped++
        }
      }
      return { applied, skipped }
    } catch (err) {
      console.warn('[bootstrap-d1] Fast SQLite execution failed, falling back to Wrangler CLI:', err.message)
    }
  }

  for (const f of files) {
    try {
      console.log(`[bootstrap-d1] applying ${f}`)
      execSync(
        `npx wrangler d1 execute beech-db --local --file=./migrations/${f}`,
        { cwd: API_DIR, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
      )
      applied++
    } catch {
      console.warn(`[bootstrap-d1] ⚠  ${f} skipped`)
      skipped++
    }
  }

  return { applied, skipped }
}

if (hasSqliteFile() && hasBaseSchema()) {
  console.log('[bootstrap-d1] DB already initialized — skipping.')
  process.exit(0)
}

console.log('[bootstrap-d1] local D1 not initialized — applying migrations…')
const { applied, skipped } = applyMigrationsInOrder()

console.log(`[bootstrap-d1] done. (${applied} applied${skipped ? `, ${skipped} skipped` : ''})`)


