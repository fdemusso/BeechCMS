#!/usr/bin/env node
/**
 * Idempotent D1 bootstrap for local dev.
 *
 * Runs every time `npm run dev:full` starts. Detects whether the local
 * D1 database exists and contains the base schema; if not, applies migrations
 * 0000 → latest in order.
 *
 * NOTE: Migration 0028_v040_seed_data.sql inserts into content_{slug} tables
 * that are created at runtime by `beech seed:load --local`. If those tables
 * don't exist yet (first run), the migration is skipped with a warning.
 * Run `cd apps/api && npm run db:reset:local` after `seed:load` to load demo data.
 *
 * Safe to run repeatedly: a fully-migrated DB is a no-op.
 */
import { existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_DIR = join(__dirname, '..')
const REPO_ROOT = join(API_DIR, '../..')
const D1_DIR = join(API_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
const MIGRATIONS_DIR = join(API_DIR, 'migrations')

function hasSqliteFile() {
  if (!existsSync(D1_DIR)) return false
  return readdirSync(D1_DIR).some(f => f.endsWith('.sqlite') && !f.startsWith('metadata'))
}

function hasBaseSchema() {
  try {
    const out = execSync(
      `npx wrangler d1 execute beech-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"`,
      { cwd: API_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
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

  for (const f of files) {
    try {
      console.log(`[bootstrap-d1] applying ${f}`)
      execSync(
        `npx wrangler d1 execute beech-db --local --file=./migrations/${f}`,
        { cwd: API_DIR, stdio: 'inherit' }
      )
      applied++
    } catch {
      // Data migrations (e.g. 0028_seed_data) reference content_{slug} tables
      // created by `seed:load --local`. Skip gracefully on first run.
      console.warn(`[bootstrap-d1] ⚠  ${f} skipped (tables may not exist yet — run seed:load first)`)
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

console.log('[bootstrap-d1] creating content tables (seed:load)…')
try {
  execSync('node bin/cli.mjs seed:load', { cwd: REPO_ROOT, stdio: 'inherit' })
} catch {
  console.warn('[bootstrap-d1] ⚠  seed:load failed — content tables may be missing. Run: node bin/cli.mjs seed:load')
}

console.log(`[bootstrap-d1] done. (${applied} applied${skipped ? `, ${skipped} skipped` : ''})`)
