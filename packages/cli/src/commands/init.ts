// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { resolve, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { findWranglerConfig, resolveDbName, executeD1File, queryD1, type WranglerOptions } from '../lib/wrangler.js'

// System tables created by the base schema migration (0000_v040_base.sql).
// Used to detect whether the DB has been initialised.
const SYSTEM_TABLES = [
  'users',
  'refresh_tokens',
  'password_reset_tokens',
  'public_idempotency_keys',
  'analytics',
  'system_stats',
  'activity_logs',
  'notifications',
  'media_objects',
  'content_event_log',
  'automations',
  'seeds',
  'seed_meta',
  'site_settings',
  'setup_completed',
]

// Embedded copy of 0000_v040_base.sql — all DDL uses CREATE TABLE IF NOT EXISTS,
// so this is safe to re-run against an already-initialised database.
const BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT    NOT NULL PRIMARY KEY,
    email               TEXT    NOT NULL UNIQUE,
    password_hash       TEXT    NOT NULL,
    role                TEXT    NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
    name                TEXT,
    avatar_url          TEXT,
    notification_prefs  TEXT    NOT NULL DEFAULT '{}',
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked_at  INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash    ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    used_at     INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS public_idempotency_keys (
    idempotency_key     TEXT    NOT NULL PRIMARY KEY,
    request_fingerprint TEXT    NOT NULL,
    response_status     INTEGER NOT NULL,
    response_body       TEXT    NOT NULL,
    created_at          INTEGER NOT NULL,
    expires_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON public_idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS analytics (
    id      INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    day_ts  INTEGER NOT NULL,
    metric  TEXT    NOT NULL,
    seed    TEXT    NOT NULL DEFAULT '',
    value   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(day_ts, metric, seed)
);

CREATE INDEX IF NOT EXISTS idx_analytics_day  ON analytics(day_ts);
CREATE INDEX IF NOT EXISTS idx_analytics_seed ON analytics(seed, day_ts);

CREATE TABLE IF NOT EXISTS system_stats (
    id    TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO system_stats (id, value) VALUES ('total_storage_bytes', '0');

CREATE TABLE IF NOT EXISTS activity_logs (
    id          TEXT    NOT NULL PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    user_email  TEXT    NOT NULL,
    user_name   TEXT,
    action      TEXT    NOT NULL,
    entity_type TEXT    NOT NULL,
    entity_id   TEXT    NOT NULL,
    entity_slug TEXT,
    details     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_activity_user    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);

CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT    NOT NULL PRIMARY KEY,
    title      TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error')),
    is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(is_read);

CREATE TABLE IF NOT EXISTS media_objects (
    key         TEXT    NOT NULL PRIMARY KEY,
    filename    TEXT    NOT NULL,
    mime_type   TEXT    NOT NULL,
    size_bytes  INTEGER NOT NULL,
    uploaded_by TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_media_user    ON media_objects(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_objects(created_at DESC);

CREATE TABLE IF NOT EXISTS content_event_log (
    id          TEXT    NOT NULL PRIMARY KEY,
    schema_slug TEXT    NOT NULL,
    entry_id    TEXT    NOT NULL,
    action      TEXT    NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    user_id     TEXT,
    details     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_event_log_schema_slug ON content_event_log(schema_slug);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at  ON content_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_entry_id    ON content_event_log(entry_id);

CREATE TABLE IF NOT EXISTS automations (
  id                 TEXT    NOT NULL PRIMARY KEY,
  seed_slug          TEXT    NOT NULL,
  name               TEXT    NOT NULL,
  enabled            INTEGER NOT NULL DEFAULT 1,
  trigger_event      TEXT    NOT NULL CHECK(trigger_event IN ('create','update','delete','cron')),
  trigger_cron       TEXT,
  trigger_conditions TEXT,
  actions            TEXT    NOT NULL,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_automations_seed_slug ON automations(seed_slug);
CREATE INDEX IF NOT EXISTS idx_automations_enabled   ON automations(enabled);

CREATE TABLE IF NOT EXISTS seeds (
    slug        TEXT    NOT NULL PRIMARY KEY,
    definition  TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'deleted')),
    source      TEXT    NOT NULL DEFAULT 'runtime'
                        CHECK (source IN ('code', 'runtime')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_seeds_status ON seeds(status);

CREATE TABLE IF NOT EXISTS seed_meta (
    id      TEXT NOT NULL PRIMARY KEY,
    value   TEXT NOT NULL
);

INSERT OR IGNORE INTO seed_meta (id, value) VALUES ('registry_version', '1');

CREATE TABLE IF NOT EXISTS site_settings (
    key   TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setup_completed (
    id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1)
);
`.trim()

const PLACEHOLDER_DB_IDS = [
  'INCOLLA_QUI_IL_TUO_ID_D1',
  'FILL_IN_YOUR_D1_DATABASE_ID',
  'YOUR_D1_DATABASE_ID',
]

export interface InitOptions {
  initDb: boolean
  local: boolean
  db?: string
  nonInteractive?: boolean
}

function checkWranglerAuth(): boolean {
  const result = spawnSync('npx', ['wrangler', 'whoami', '--json'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
    shell: true,
  })
  return result.status === 0
}

function checkWranglerPlaceholders(configPath: string): string[] {
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const stripped = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const parsed = JSON.parse(stripped)
    const bindings: { database_id?: string; database_name?: string }[] = parsed?.d1_databases ?? []
    const issues: string[] = []
    for (const b of bindings) {
      const id = b.database_id ?? ''
      if (!id || PLACEHOLDER_DB_IDS.includes(id)) {
        issues.push(`d1_databases[0].database_id is "${id || '(empty)'}"`)
      }
    }
    return issues
  } catch {
    return []
  }
}

function readProjectName(configPath: string | null): string {
  if (!configPath) return basename(process.cwd())
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const stripped = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const parsed = JSON.parse(stripped)
    return (parsed?.name as string | undefined) || basename(process.cwd())
  } catch {
    return basename(process.cwd())
  }
}

function readBucketName(configPath: string | null): string | null {
  if (!configPath) return null
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const stripped = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const parsed = JSON.parse(stripped)
    const buckets: { bucket_name?: string }[] = parsed?.r2_buckets ?? []
    return buckets[0]?.bucket_name ?? null
  } catch {
    return null
  }
}

function createD1Database(dbName: string): string | null {
  const result = spawnSync('npx', ['wrangler', 'd1', 'create', dbName, '--json'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (result.status !== 0) return null
  try {
    const parsed = JSON.parse(result.stdout)
    return (parsed?.uuid ?? parsed?.database_id ?? null) as string | null
  } catch {
    return null
  }
}

function createR2Bucket(bucketName: string): boolean {
  const result = spawnSync('npx', ['wrangler', 'r2', 'bucket', 'create', bucketName], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })
  return result.status === 0
}

function patchWranglerConfig(configPath: string, dbId: string): boolean {
  try {
    let raw = readFileSync(configPath, 'utf-8')
    for (const placeholder of PLACEHOLDER_DB_IDS) {
      raw = raw.split(placeholder).join(dbId)
    }
    raw = raw.replace(/"database_id"\s*:\s*""/g, `"database_id": "${dbId}"`)
    writeFileSync(configPath, raw, 'utf-8')
    return true
  } catch {
    return false
  }
}

function printManualDbInstructions(): void {
  console.log(pc.dim('\n  Update your D1 database_id in wrangler.jsonc,'))
  console.log(pc.dim('  or create a new database with:'))
  console.log(pc.cyan('\n  → Run:  npx wrangler d1 create my-project-db'))
  console.log(pc.cyan('  → Then: npx beech init --db\n'))
}

function echoApiKeys(configPath: string | null | undefined): void {
  if (!configPath) return
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const stripped = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const parsed = JSON.parse(stripped)
    const vars: Record<string, string> = parsed?.vars ?? {}
    const readKey = vars['PUBLIC_READ_API_KEY']
    const writeKey = vars['PUBLIC_WRITE_API_KEY']
    if (!readKey && !writeKey) return
    console.log(pc.dim('  API keys detected in wrangler.jsonc:\n'))
    if (readKey) {
      const masked = readKey.length > 8 ? readKey.slice(0, 4) + '****' + readKey.slice(-4) : '****'
      console.log(pc.dim(`    PUBLIC_READ_API_KEY  = ${masked}`))
    }
    if (writeKey) {
      const masked = writeKey.length > 8 ? writeKey.slice(0, 4) + '****' + writeKey.slice(-4) : '****'
      console.log(pc.dim(`    PUBLIC_WRITE_API_KEY = ${masked}`))
    }
    console.log(pc.dim('\n  Use these in your frontend as the X-API-Key header.\n'))
  } catch {
    // wrangler.jsonc may be missing or malformed — skip silently
  }
}

function checkFiles(cwd: string, checkDevVars: boolean): boolean {
  let ok = true

  const workerExists = existsSync(resolve(cwd, 'worker.ts')) || existsSync(resolve(cwd, 'worker.js'))
  if (!workerExists) {
    console.log(pc.red('  ✗ worker.ts        — missing (required)'))
    ok = false
  } else {
    console.log(pc.green('  ✓ worker.ts'))
  }

  const configPath = findWranglerConfig()
  const configInCwd = configPath &&
    (configPath === resolve(cwd, 'wrangler.jsonc') ||
     configPath === resolve(cwd, 'wrangler.json') ||
     configPath === resolve(cwd, 'wrangler.toml'))

  if (!configInCwd) {
    console.log(pc.red('  ✗ wrangler.jsonc   — missing (required)'))
    ok = false
  } else {
    console.log(pc.green(`  ✓ ${basename(configPath!)}`))
  }

  const seedsExists =
    existsSync(resolve(cwd, 'seeds.ts')) ||
    existsSync(resolve(cwd, 'seeds.js')) ||
    existsSync(resolve(cwd, 'seed.ts')) ||
    existsSync(resolve(cwd, 'seed.js'))

  if (!seedsExists) {
    console.log(pc.yellow('  ⚠ seeds.ts         — not found (optional: needed only for the one-time code → DB load; after `beech seed:load`, the DB is canonical)'))
  } else {
    console.log(pc.green('  ✓ seeds.ts'))
  }

  if (checkDevVars) {
    if (!existsSync(resolve(cwd, '.dev.vars'))) {
      console.log(pc.dim('  ○ .dev.vars        — not found (optional: only needed for production R2 credentials)'))
    } else {
      console.log(pc.green('  ✓ .dev.vars'))
    }
  }

  return ok
}

function printNextSteps(local: boolean): void {
  const localFlag = local ? ' --local' : ''
  console.log(pc.dim('  Next steps:'))
  console.log(pc.cyan(`  1. npx beech seed:load${localFlag}`))
  console.log(pc.dim('      → create content tables and register seed definitions in D1'))
  console.log(pc.cyan('  2. npx wrangler dev'))
  console.log(pc.dim('      → start API + dashboard'))
  console.log(pc.dim('  3. Open http://localhost:8789/admin\n'))
}

function getExistingTables(options: WranglerOptions): string[] | null {
  try {
    const rows = queryD1<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table'`,
      options
    )
    return rows.map(r => r.name)
  } catch {
    return null
  }
}

export async function init(args: InitOptions): Promise<void> {
  const cwd = process.cwd()

  console.log(pc.cyan('\n  beech init — project check\n'))

  const filesOk = checkFiles(cwd, args.local)

  if (!filesOk) {
    console.log(pc.red('\n  ✗ Required files missing\n'))
    console.log(pc.dim('  Fix the errors above before initialising the database.'))
    console.log(pc.cyan('\n  → See: https://beechcms.dev/docs/getting-started\n'))
    process.exit(1)
  }

  console.log(pc.green('\n  All required files present.\n'))

  if (!args.initDb) {
    echoApiKeys(findWranglerConfig())
    const localFlag = args.local ? ' --local' : ''
    console.log(pc.dim('  Next steps:'))
    console.log(pc.dim(`  1. npx beech init --db${localFlag}     # initialise D1 database`))
    console.log(pc.dim(`  2. npx beech seed:load${localFlag}     # create content tables`))
    console.log(pc.dim('  3. npx wrangler dev                 # start API + dashboard'))
    console.log(pc.dim('  4. Open http://localhost:8789/admin\n'))
    return
  }

  // --- Database initialisation ---
  const configPath = findWranglerConfig()

  // Check for placeholder database_id before touching the DB
  if (configPath) {
    const placeholders = checkWranglerPlaceholders(configPath)
    if (placeholders.length > 0) {
      console.log(pc.yellow('  ⚠ wrangler.jsonc contains placeholder values:\n'))
      for (const issue of placeholders) {
        console.log(pc.yellow(`    - ${issue}`))
      }

      if (process.stdin.isTTY && !args.nonInteractive) {
        // Interactive: offer auto-creation of D1 + R2
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        let autoCreate = false
        try {
          const answer = (await rl.question(
            pc.cyan('\n  → Create a new D1 database (and R2 bucket) on Cloudflare automatically? (Y/n): ')
          )).trim().toLowerCase()
          autoCreate = !answer || answer === 'y' || answer === 'yes'
        } finally {
          rl.close()
        }

        if (autoCreate) {
          // Auth required for resource creation
          const authed = checkWranglerAuth()
          if (!authed) {
            console.log(pc.red('\n  ✗ Not logged in to Cloudflare\n'))
            console.log(pc.dim('  BeechCMS needs access to your Cloudflare account to create the database.'))
            console.log(pc.cyan('\n  → Run:  npx wrangler login'))
            console.log(pc.cyan('  → Then: npx beech init --db\n'))
            process.exit(1)
          }

          const projectName = readProjectName(configPath)
          const dbName = `${projectName}-db`
          const bucketName = readBucketName(configPath) || `${projectName}-media`

          console.log(pc.dim(`\n  Creating D1 database "${dbName}"…`))
          const dbId = createD1Database(dbName)
          if (!dbId) {
            console.log(pc.red('\n  ✗ Failed to create D1 database\n'))
            console.log(pc.dim('  Create it manually and retry:'))
            console.log(pc.cyan(`\n  → Run:  npx wrangler d1 create ${dbName}`))
            console.log(pc.cyan('  → Then: npx beech init --db\n'))
            process.exit(1)
          }
          console.log(pc.green(`  ✓ D1 database created (id: ${dbId})`))

          console.log(pc.dim(`\n  Creating R2 bucket "${bucketName}"…`))
          const r2Ok = createR2Bucket(bucketName)
          if (r2Ok) {
            console.log(pc.green(`  ✓ R2 bucket "${bucketName}" created`))
          } else {
            console.log(pc.yellow(`  ⚠ R2 bucket creation failed (may already exist — continuing)`))
          }

          console.log(pc.dim('\n  Updating wrangler.jsonc…'))
          const patched = patchWranglerConfig(configPath, dbId)
          if (patched) {
            console.log(pc.green('  ✓ wrangler.jsonc updated\n'))
          } else {
            console.log(pc.yellow(`  ⚠ Could not update wrangler.jsonc automatically\n`))
            console.log(pc.dim(`  Set database_id = "${dbId}" in wrangler.jsonc manually, then retry:`))
            console.log(pc.cyan('  → Run: npx beech init --db\n'))
            process.exit(1)
          }
          // Fall through to continue DB initialization with the newly created database
        } else {
          printManualDbInstructions()
          process.exit(1)
        }
      } else if (args.nonInteractive && args.local) {
        // --yes + --local: local D1 needs no real database_id — just proceed
        console.log(pc.dim('  --yes: proceeding with local mode (no remote resources needed)\n'))
        // Fall through to DB initialization
      } else {
        if (args.nonInteractive) {
          // --yes + --remote + placeholder → cannot proceed non-interactively
          console.log(pc.red('\n  ✗ Cannot proceed non-interactively: remote database has a placeholder database_id\n'))
          console.log(pc.dim('  Set a real database_id in wrangler.jsonc, then retry.'))
          process.exit(1)
        }
        printManualDbInstructions()
        process.exit(1)
      }
    }
  }

  // For remote operations, verify Cloudflare auth before attempting any wrangler calls
  if (!args.local) {
    const authed = checkWranglerAuth()
    if (!authed) {
      console.log(pc.red('  ✗ Not logged in to Cloudflare\n'))
      console.log(pc.dim('  BeechCMS needs access to your Cloudflare account to manage the D1 database.'))
      console.log(pc.cyan('\n  → Run:  npx wrangler login'))
      console.log(pc.cyan('  → Then: npx beech init --db\n'))
      process.exit(1)
    }
  }

  const db = args.db ?? resolveDbName(configPath)
  const options: WranglerOptions = { db, local: args.local, configPath }

  console.log(pc.cyan(`  Checking database "${db}" (${args.local ? 'local' : 'remote'})…\n`))

  const existingTables = getExistingTables(options)
  const missingTables = SYSTEM_TABLES.filter(t => !existingTables?.includes(t))

  // Remote mode: verification only — do not auto-apply schema.
  // In production, system tables are created by `wrangler deploy` migrations.
  if (!args.local) {
    if (existingTables === null) {
      console.log(pc.red('  ✗ Remote database unreachable\n'))
      console.log(pc.dim('  Most likely causes:'))
      console.log(pc.dim('    - Wrong database_id in wrangler.jsonc'))
      console.log(pc.dim('    - Worker not yet deployed'))
      console.log(pc.cyan('\n  → Fix:  Update d1_databases.database_id in wrangler.jsonc'))
      console.log(pc.cyan('  → Then: npm run deploy\n'))
      process.exit(1)
    }

    if (missingTables.length > 0) {
      console.log(pc.yellow(`  ⚠ Missing system tables: ${missingTables.join(', ')}\n`))
      console.log(pc.dim('  Most likely causes:'))
      console.log(pc.dim('    - Wrong database_id in wrangler.jsonc'))
      console.log(pc.dim('    - Migrations did not run during deploy'))
      console.log(pc.cyan('\n  → Fix:  Update d1_databases.database_id in wrangler.jsonc'))
      console.log(pc.cyan('  → Then: npm run deploy\n'))
      process.exit(1)
    }

    for (const table of SYSTEM_TABLES) {
      console.log(pc.green(`  ✓ ${table}`))
    }
    console.log(pc.green('\n  All system tables present. Remote database is initialized.\n'))
    return
  }

  // Local mode: apply schema if tables are missing.
  if (existingTables === null) {
    console.log(pc.yellow('  Database unreachable or not yet created — applying base schema…\n'))
  } else if (missingTables.length === 0) {
    console.log(pc.green('  ✓ All system tables present. Database already initialised.\n'))
    printNextSteps(args.local)
    return
  } else {
    console.log(pc.yellow(`  Missing system tables: ${missingTables.join(', ')}`))
    console.log(pc.cyan('\n  Applying base schema…\n'))
  }

  const ok = executeD1File(BASE_SCHEMA_SQL, options)
  if (!ok) {
    console.log(pc.red('\n  ✗ Database initialisation failed\n'))
    console.log(pc.dim('  wrangler reported an error above.'))
    console.log(pc.cyan('\n  → Run: npx beech init --db --local\n'))
    process.exit(1)
  }

  console.log(pc.green('\n  ✓ worker.ts'))
  console.log(pc.green(`  ✓ ${configPath ? basename(configPath) : 'wrangler.jsonc'}`))
  console.log(pc.green('  ✓ seeds.ts'))
  console.log(pc.green('  ✓ Local D1 system tables ready\n'))
  echoApiKeys(configPath)
  printNextSteps(args.local)
}
