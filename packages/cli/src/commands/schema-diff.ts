// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { resolve } from 'node:path'
import { SEED_REGISTRY, sortSeedsByDependencies, type Seed } from '@beechcms/core'
import { findWranglerConfig, resolveDbName, type WranglerOptions } from '../lib/wrangler.js'
import { diffSeed, renderSeedDiff, isSeedClean } from '../lib/schema-diff.js'
import { nextMigrationIndex, buildMigrationSql, writeMigrationFile } from '../lib/migration-writer.js'

export interface SchemaDiffOptions {
  /** Compare against remote D1 (default: local). */
  local: boolean
  /** When set, write an additive migration file instead of just printing. */
  write: boolean
  /** Optional migration name (used in the filename). */
  name?: string
  /** Override migrations dir (default: <cwd>/apps/api/migrations). */
  migrationsDir?: string
  /** Override D1 database name. */
  db?: string
  registry?: Record<string, Seed> | null
}

function resolveMigrationsDir(override?: string): string {
  if (override) return resolve(process.cwd(), override)
  return resolve(process.cwd(), 'apps', 'api', 'migrations')
}

export async function schemaDiff(args: SchemaDiffOptions): Promise<void> {
  const registry = args.registry ?? SEED_REGISTRY
  if (Object.keys(registry).length === 0) {
    console.log(pc.yellow('\n  ✗ No seeds found — nothing to diff.\n'))
    return
  }

  const configPath = findWranglerConfig()
  const options: WranglerOptions = { db: args.db ?? resolveDbName(configPath), local: args.local, configPath }
  const seeds = sortSeedsByDependencies(Object.values(registry))

  console.log(pc.cyan(`\n  Diffing schema vs ${args.local ? 'local' : 'remote'} D1 (${options.db})…\n`))
  const diffs = []
  let clean = true
  for (const seed of seeds) {
    const d = await diffSeed(seed, options)
    diffs.push(d)
    renderSeedDiff(d)
    if (!isSeedClean(d)) clean = false
  }

  if (clean) { console.log(pc.green('\n  Schema matches seeds. No migration needed.\n')); return }

  const plan = buildMigrationSql(diffs, registry)
  if (!args.write) {
    console.log(pc.dim('\n  -- proposed additive migration (preview):\n'))
    console.log(plan.sql)
    if (plan.destructiveSlugs.length) {
      console.log(pc.yellow(`\n  ⚠ Destructive drift in: ${plan.destructiveSlugs.join(', ')} — not auto-migrated.`))
    }
    console.log(pc.cyan('\n  → Re-run with --write to save the migration file.\n'))
    return
  }

  if (plan.additiveCount === 0) {
    console.log(pc.yellow('\n  ⚠ Only destructive drift detected — no additive migration written.'))
    console.log(pc.dim('  Author a reviewed migration by hand for renames/drops/type changes.\n'))
    return
  }

  const dir = resolveMigrationsDir(args.migrationsDir)
  const index = nextMigrationIndex(dir)
  const file = writeMigrationFile(dir, index, args.name ?? 'schema_sync', plan.sql)
  console.log(pc.green(`\n  ✓ Wrote ${file} (${plan.additiveCount} statement(s)).`))
  console.log(pc.dim('  Review, commit, then `wrangler d1 migrations apply --remote` in CI.\n'))
  if (plan.destructiveSlugs.length) {
    console.log(pc.yellow(`  ⚠ Destructive drift in ${plan.destructiveSlugs.join(', ')} was NOT included.\n`))
  }
}
